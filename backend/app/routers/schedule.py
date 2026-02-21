from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional, Set
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user
from app.models.content_tag import ContentTag
from app.models.schedule import ScheduleEvent
from app.models.schedule_attendee import ScheduleEventAttendee
from app.models.tag import Tag
from app.models.user import UserProfile
from app.schemas.schedule import (
    ScheduleAttendeeOut,
    ScheduleEventCreate,
    ScheduleEventOut,
    ScheduleEventUpdate,
    ScheduleRSVPUpdate,
    ScheduleUser,
)

router = APIRouter()



def _user_map(db: Session, user_ids: Set[UUID]) -> Dict[UUID, UserProfile]:
    if not user_ids:
        return {}
    rows = db.query(UserProfile).filter(UserProfile.id.in_(list(user_ids))).all()
    return {r.id: r for r in rows}



def _build_event_out(db: Session, event: ScheduleEvent) -> ScheduleEventOut:
    attendees_rows = (
        db.query(ScheduleEventAttendee)
        .filter(ScheduleEventAttendee.event_id == event.id)
        .order_by(ScheduleEventAttendee.created_at.asc())
        .all()
    )
    attendee_user_ids = {r.user_id for r in attendees_rows}
    users = _user_map(db, attendee_user_ids | {event.created_by})

    creator = users.get(event.created_by)
    creator_payload = ScheduleUser(
        id=event.created_by,
        display_name=creator.display_name if creator else "Unknown",
        avatar_url=creator.avatar_url if creator else None,
    )

    attendees = []
    for row in attendees_rows:
        u = users.get(row.user_id)
        attendees.append(
            ScheduleAttendeeOut(
                id=row.user_id,
                display_name=u.display_name if u else "Unknown",
                avatar_url=u.avatar_url if u else None,
                status=row.status,
            )
        )

    tag_rows = (
        db.query(ContentTag)
        .filter(ContentTag.content_type == "schedule_event", ContentTag.content_id == event.id)
        .all()
    )
    tag_map = {t.id: t for t in db.query(Tag).filter(Tag.id.in_([r.tag_id for r in tag_rows])).all()} if tag_rows else {}
    tags = [
        {"id": t.id, "name": t.name, "slug": t.slug, "color": t.color}
        for t in (tag_map.get(r.tag_id) for r in tag_rows)
        if t is not None
    ]

    return ScheduleEventOut(
        id=event.id,
        title=event.title,
        description=event.description,
        start_time=event.start_time,
        end_time=event.end_time,
        is_all_day=event.is_all_day,
        location=event.location,
        color=event.color,
        creator=creator_payload,
        attendees=attendees,
        tags=tags,
        created_at=event.created_at,
        updated_at=event.updated_at,
    )


@router.get("", response_model=dict)
def list_schedule_events(
    from_dt: Optional[datetime] = Query(default=None, alias="from"),
    to_dt: Optional[datetime] = Query(default=None, alias="to"),
    user_id: Optional[UUID] = Query(default=None),
    tag: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _: RequestUser = Depends(get_current_user),
):
    q = db.query(ScheduleEvent)

    if from_dt:
        q = q.filter(ScheduleEvent.end_time >= from_dt)
    if to_dt:
        q = q.filter(ScheduleEvent.start_time <= to_dt)
    if user_id:
        q = q.filter(ScheduleEvent.created_by == user_id)

    rows = q.order_by(ScheduleEvent.start_time.asc()).all()

    if tag:
        tag_row = db.query(Tag).filter(Tag.slug == tag).first()
        if not tag_row:
            return {"data": []}
        tagged_event_ids = {
            r.content_id
            for r in db.query(ContentTag)
            .filter(ContentTag.content_type == "schedule_event", ContentTag.tag_id == tag_row.id)
            .all()
        }
        rows = [r for r in rows if r.id in tagged_event_ids]

    return {"data": [_build_event_out(db, row) for row in rows]}


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_schedule_event(
    payload: ScheduleEventCreate,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    if payload.end_time <= payload.start_time:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")

    event = ScheduleEvent(created_by=current_user.id, **payload.model_dump(exclude={"attendee_ids", "tag_ids"}))
    db.add(event)
    db.commit()
    db.refresh(event)

    attendee_ids = set(payload.attendee_ids)
    attendee_ids.add(current_user.id)
    for uid in attendee_ids:
        db.add(
            ScheduleEventAttendee(
                event_id=event.id,
                user_id=uid,
                status="accepted" if uid == current_user.id else "invited",
            )
        )

    for tag_id in payload.tag_ids:
        db.add(ContentTag(tag_id=tag_id, content_type="schedule_event", content_id=event.id))

    db.commit()

    return {"data": _build_event_out(db, event), "message": "Event created"}


@router.patch("/{event_id}", response_model=dict)
def update_schedule_event(
    event_id: UUID,
    payload: ScheduleEventUpdate,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    event = db.query(ScheduleEvent).filter(ScheduleEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    if event.created_by != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only creator/admin can update")

    updates = payload.model_dump(exclude_unset=True)
    attendee_ids = updates.pop("attendee_ids", None)
    tag_ids = updates.pop("tag_ids", None)

    start_time = updates.get("start_time", event.start_time)
    end_time = updates.get("end_time", event.end_time)
    if end_time <= start_time:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")

    ALLOWED_EVENT_FIELDS = {"title", "description", "start_time", "end_time", "is_all_day", "location", "color"}
    for key, value in updates.items():
        if key in ALLOWED_EVENT_FIELDS:
            setattr(event, key, value)

    db.add(event)

    if attendee_ids is not None:
        db.query(ScheduleEventAttendee).filter(ScheduleEventAttendee.event_id == event.id).delete()
        normalized = set(attendee_ids)
        normalized.add(event.created_by)
        for uid in normalized:
            db.add(
                ScheduleEventAttendee(
                    event_id=event.id,
                    user_id=uid,
                    status="accepted" if uid == event.created_by else "invited",
                )
            )

    if tag_ids is not None:
        db.query(ContentTag).filter(
            ContentTag.content_type == "schedule_event", ContentTag.content_id == event.id
        ).delete()
        for tag_id in tag_ids:
            db.add(ContentTag(tag_id=tag_id, content_type="schedule_event", content_id=event.id))

    db.commit()
    db.refresh(event)

    return {"data": _build_event_out(db, event), "message": "Event updated"}


@router.delete("/{event_id}", response_model=dict)
def delete_schedule_event(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    event = db.query(ScheduleEvent).filter(ScheduleEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    if event.created_by != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only creator/admin can delete")

    db.query(ScheduleEventAttendee).filter(ScheduleEventAttendee.event_id == event.id).delete()
    db.query(ContentTag).filter(
        ContentTag.content_type == "schedule_event", ContentTag.content_id == event.id
    ).delete()
    db.delete(event)
    db.commit()

    return {"data": {"deleted": True}, "message": "Event deleted"}


@router.patch("/{event_id}/rsvp", response_model=dict)
def rsvp_schedule_event(
    event_id: UUID,
    payload: ScheduleRSVPUpdate,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    event = db.query(ScheduleEvent).filter(ScheduleEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    row = (
        db.query(ScheduleEventAttendee)
        .filter(ScheduleEventAttendee.event_id == event_id, ScheduleEventAttendee.user_id == current_user.id)
        .first()
    )
    if not row:
        row = ScheduleEventAttendee(event_id=event_id, user_id=current_user.id, status=payload.status)
    else:
        row.status = payload.status

    db.add(row)
    db.commit()

    return {"data": {"status": payload.status}, "message": "RSVP updated"}
