from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user
from app.models.notification import Notification
from app.models.user import UserProfile
from app.schemas.notification import NotificationActor, NotificationOut

router = APIRouter()


@router.get("", response_model=dict)
def list_notifications(
    is_read: Optional[bool] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    q = db.query(Notification).filter(Notification.user_id == current_user.id)

    if is_read is not None:
        q = q.filter(Notification.is_read == is_read)

    if cursor:
        try:
            q = q.filter(Notification.id < UUID(cursor))
        except ValueError:
            pass

    rows = q.order_by(Notification.created_at.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = str(rows[-1].id) if has_more and rows else None

    actor_ids = list({r.actor_id for r in rows if r.actor_id})
    actors = {
        u.id: NotificationActor(id=u.id, display_name=u.display_name, avatar_url=u.avatar_url)
        for u in db.query(UserProfile).filter(UserProfile.id.in_(actor_ids)).all()
    }

    data = [
        NotificationOut(
            id=row.id,
            type=row.type,
            title=row.title,
            body=row.body,
            link=row.link,
            is_read=row.is_read,
            actor=actors.get(row.actor_id),
            created_at=row.created_at,
        )
        for row in rows
    ]

    unread_count = (
        db.query(func.count(Notification.id))
        .filter(Notification.user_id == current_user.id, Notification.is_read.is_(False))
        .scalar()
        or 0
    )

    return {
        "data": data,
        "pagination": {
            "has_more": has_more,
            "next_cursor": next_cursor,
            "total": len(data),
        },
        "unread_count": int(unread_count),
    }


@router.patch("/read-all", response_model=dict)
def mark_all_as_read(
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    rows = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id, Notification.is_read.is_(False))
        .all()
    )

    updated = 0
    for row in rows:
        row.is_read = True
        db.add(row)
        updated += 1

    db.commit()

    return {
        "data": {"updated": updated},
        "message": "All notifications marked as read",
    }


@router.patch("/{notification_id}/read", response_model=dict)
def mark_one_as_read(
    notification_id: UUID,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    row = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    row.is_read = True
    db.add(row)
    db.commit()

    return {"data": {"read": True}, "message": "Notification marked as read"}


@router.delete("/{notification_id}", response_model=dict)
def delete_notification(
    notification_id: UUID,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    row = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    db.delete(row)
    db.commit()

    return {"data": {"deleted": True}}
