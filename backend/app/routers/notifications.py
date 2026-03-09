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
from app.utils.profile import resolve_avatar_url, resolve_member_color

router = APIRouter()


def _notification_category(notification_type: str) -> str:
    if notification_type == "comment_on_post":
        return "comments"
    if notification_type == "comment_reply":
        return "replies"
    if notification_type == "comment_reaction":
        return "reactions"
    if notification_type == "mention":
        return "mentions"
    if notification_type.startswith("system_") or notification_type.endswith("_alert"):
        return "system"
    if notification_type == "storage_integrity_alert":
        return "system"
    return "other"


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
        u.id: NotificationActor(
            id=u.id,
            display_name=u.display_name,
            avatar_url=resolve_avatar_url(u.avatar_url),
            member_color=resolve_member_color(u.id, u.preferences),
        )
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


@router.get("/summary", response_model=dict)
def notification_summary(
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    rows = (
        db.query(Notification.type, Notification.is_read, func.count(Notification.id))
        .filter(Notification.user_id == current_user.id)
        .group_by(Notification.type, Notification.is_read)
        .all()
    )

    unread_total = 0
    category_counts = {
        "comments": 0,
        "replies": 0,
        "reactions": 0,
        "mentions": 0,
        "system": 0,
        "other": 0,
    }
    by_type: dict[str, dict[str, int]] = {}

    for notif_type, is_read, count in rows:
        type_key = str(notif_type or "unknown")
        count_int = int(count or 0)
        bucket = by_type.setdefault(type_key, {"read": 0, "unread": 0, "total": 0})
        bucket["total"] += count_int
        if is_read:
            bucket["read"] += count_int
            continue
        bucket["unread"] += count_int
        unread_total += count_int
        category = _notification_category(type_key)
        category_counts[category] = category_counts.get(category, 0) + count_int

    return {
        "data": {
            "unread_total": unread_total,
            "categories": category_counts,
            "by_type": by_type,
        }
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
