from __future__ import annotations

from typing import Dict, List, Optional, Set
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user
from app.models.comment import Comment
from app.models.research_note import ResearchNote
from app.models.schedule import ScheduleEvent
from app.models.shared_post import SharedPost
from app.models.user import UserProfile

router = APIRouter()



def _authors_map(db: Session, user_ids: Set[UUID]) -> Dict[UUID, dict]:
    if not user_ids:
        return {}
    rows = db.query(UserProfile).filter(UserProfile.id.in_(list(user_ids))).all()
    return {
        row.id: {
            "id": row.id,
            "display_name": row.display_name,
            "avatar_url": row.avatar_url,
        }
        for row in rows
    }


@router.get("", response_model=dict)
def get_activity_feed(
    limit: int = Query(default=30, ge=1, le=100),
    cursor: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _: RequestUser = Depends(get_current_user),
):
    events: List[dict] = []
    user_ids: Set[UUID] = set()

    shared_posts = (
        db.query(SharedPost)
        .filter(SharedPost.deleted_at.is_(None))
        .order_by(SharedPost.created_at.desc())
        .limit(80)
        .all()
    )
    for p in shared_posts:
        action = "created_kanban_card" if p.type == "kanban" else "created_article"
        events.append(
            {
                "id": f"shared_post:{p.id}",
                "actor_id": p.user_id,
                "action": action,
                "target_type": "shared_post",
                "target_id": p.id,
                "target_title": p.title,
                "target_link": f"/shared-posts/{p.id}",
                "created_at": p.created_at,
            }
        )
        user_ids.add(p.user_id)

    notes = (
        db.query(ResearchNote)
        .filter(ResearchNote.deleted_at.is_(None), ResearchNote.is_shared.is_(True))
        .order_by(ResearchNote.created_at.desc())
        .limit(80)
        .all()
    )
    for n in notes:
        events.append(
            {
                "id": f"research_note:{n.id}",
                "actor_id": n.user_id,
                "action": "created_research_note",
                "target_type": "research_note",
                "target_id": n.id,
                "target_title": n.title,
                "target_link": f"/research-notes/{n.id}",
                "created_at": n.created_at,
            }
        )
        user_ids.add(n.user_id)

    comments = (
        db.query(Comment)
        .filter(Comment.deleted_at.is_(None))
        .order_by(Comment.created_at.desc())
        .limit(100)
        .all()
    )
    for c in comments:
        target_link = f"/{c.content_type}s/{c.content_id}"
        events.append(
            {
                "id": f"comment:{c.id}",
                "actor_id": c.user_id,
                "action": "added_comment",
                "target_type": c.content_type,
                "target_id": c.content_id,
                "target_title": "Comment",
                "target_link": target_link,
                "created_at": c.created_at,
            }
        )
        user_ids.add(c.user_id)

    schedules = db.query(ScheduleEvent).order_by(ScheduleEvent.created_at.desc()).limit(60).all()
    for s in schedules:
        events.append(
            {
                "id": f"schedule:{s.id}",
                "actor_id": s.created_by,
                "action": "created_schedule_event",
                "target_type": "schedule_event",
                "target_id": s.id,
                "target_title": s.title,
                "target_link": f"/schedule/{s.id}",
                "created_at": s.created_at,
            }
        )
        user_ids.add(s.created_by)

    authors = _authors_map(db, user_ids)

    events.sort(key=lambda x: x["created_at"].timestamp() if x["created_at"] else 0.0, reverse=True)

    offset = 0
    if cursor:
        try:
            offset = max(0, int(cursor))
        except ValueError:
            offset = 0

    paged = events[offset : offset + limit]
    next_cursor = str(offset + limit) if (offset + limit) < len(events) else None

    data = [
        {
            "id": row["id"],
            "actor": authors.get(row["actor_id"]),
            "action": row["action"],
            "target_type": row["target_type"],
            "target_id": row["target_id"],
            "target_title": row["target_title"],
            "target_link": row["target_link"],
            "created_at": row["created_at"],
        }
        for row in paged
    ]

    return {
        "data": data,
        "pagination": {
            "has_more": next_cursor is not None,
            "next_cursor": next_cursor,
            "total": len(data),
        },
    }
