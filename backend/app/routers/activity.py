from __future__ import annotations

from typing import Dict, List, Optional, Set
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user
from app.models.comment import Comment
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.research_note import ResearchNote
from app.models.schedule import ScheduleEvent
from app.models.shared_post import SharedPost
from app.models.user import UserProfile
from app.utils.profile import resolve_avatar_url, resolve_member_color

router = APIRouter()


def _membership_project_ids(db: Session, user_id: UUID) -> Set[UUID]:
    rows = db.query(ProjectMember.project_id).filter(ProjectMember.user_id == user_id).all()
    return {row[0] for row in rows if row and row[0] is not None}


def _project_name_map(db: Session, project_ids: Set[UUID]) -> Dict[UUID, str]:
    if not project_ids:
        return {}
    rows = db.query(Project.id, Project.name).filter(Project.id.in_(list(project_ids))).all()
    return {row[0]: row[1] for row in rows}


def _authors_map(db: Session, user_ids: Set[UUID]) -> Dict[UUID, dict]:
    if not user_ids:
        return {}
    rows = db.query(UserProfile).filter(UserProfile.id.in_(list(user_ids))).all()
    def _pref_text(preferences: object, key: str) -> Optional[str]:
        if not isinstance(preferences, dict):
            return None
        value = preferences.get(key)
        if not isinstance(value, str):
            return None
        cleaned = value.strip()
        return cleaned or None

    return {
        row.id: {
            "id": row.id,
            "display_name": row.display_name,
            "avatar_url": resolve_avatar_url(row.avatar_url),
            "member_color": resolve_member_color(row.id, row.preferences),
            "status_message": _pref_text(row.preferences, "status_message"),
            "pronouns": _pref_text(row.preferences, "pronouns"),
        }
        for row in rows
    }


@router.get("", response_model=dict)
def get_activity_feed(
    limit: int = Query(default=30, ge=1, le=100),
    cursor: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    membership_project_ids = _membership_project_ids(db, current_user.id)
    if not membership_project_ids:
        return {
            "data": [],
            "pagination": {
                "has_more": False,
                "next_cursor": None,
                "total": 0,
            },
        }

    events: List[dict] = []
    user_ids: Set[UUID] = set()

    shared_posts = (
        db.query(SharedPost)
        .filter(
            SharedPost.deleted_at.is_(None),
            SharedPost.project_id.in_(list(membership_project_ids)),
            SharedPost.visibility == "shared",
        )
        .order_by(SharedPost.created_at.desc())
        .limit(120)
        .all()
    )
    for p in shared_posts:
        target_link = (
            f"/shared/feed/{p.id}"
            if p.type in {"kanban", "insight"}
            else f"/shared/articles/{p.id}"
        )
        action = "created_kanban_card" if p.type == "kanban" else "created_article"
        events.append(
            {
                "id": f"shared_post:{p.id}",
                "actor_id": p.user_id,
                "action": action,
                "target_type": "shared_post",
                "target_id": p.id,
                "target_title": p.title,
                "target_link": target_link,
                "project_id": p.project_id,
                "created_at": p.created_at,
            }
        )
        user_ids.add(p.user_id)

    notes = (
        db.query(ResearchNote)
        .filter(
            ResearchNote.deleted_at.is_(None),
            ResearchNote.is_shared.is_(True),
            ResearchNote.project_id.in_(list(membership_project_ids)),
        )
        .order_by(ResearchNote.created_at.desc())
        .limit(120)
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
                "project_id": n.project_id,
                "created_at": n.created_at,
            }
        )
        user_ids.add(n.user_id)

    comments = (
        db.query(Comment)
        .filter(Comment.deleted_at.is_(None))
        .order_by(Comment.created_at.desc())
        .limit(200)
        .all()
    )

    comment_shared_post_ids = {c.content_id for c in comments if c.content_type == "shared_post"}
    comment_note_ids = {c.content_id for c in comments if c.content_type == "research_note"}
    comment_schedule_ids = {c.content_id for c in comments if c.content_type == "schedule_event"}

    shared_post_map: Dict[UUID, tuple[Optional[UUID], str, str]] = {}
    if comment_shared_post_ids:
        rows = (
            db.query(SharedPost.id, SharedPost.project_id, SharedPost.type, SharedPost.title)
            .filter(
                SharedPost.id.in_(list(comment_shared_post_ids)),
                SharedPost.deleted_at.is_(None),
                SharedPost.visibility == "shared",
            )
            .all()
        )
        shared_post_map = {
            row[0]: (row[1], row[2] or "article", row[3] or "Comment")
            for row in rows
        }

    note_map: Dict[UUID, tuple[Optional[UUID], str]] = {}
    if comment_note_ids:
        rows = (
            db.query(ResearchNote.id, ResearchNote.project_id, ResearchNote.title)
            .filter(
                ResearchNote.id.in_(list(comment_note_ids)),
                ResearchNote.deleted_at.is_(None),
            )
            .all()
        )
        note_map = {row[0]: (row[1], row[2] or "Comment") for row in rows}

    schedule_map: Dict[UUID, tuple[Optional[UUID], str]] = {}
    if comment_schedule_ids:
        rows = (
            db.query(ScheduleEvent.id, ScheduleEvent.project_id, ScheduleEvent.title)
            .filter(ScheduleEvent.id.in_(list(comment_schedule_ids)))
            .all()
        )
        schedule_map = {row[0]: (row[1], row[2] or "Comment") for row in rows}

    for c in comments:
        project_id: Optional[UUID] = None
        target_title = "Comment"
        target_link = f"/{c.content_type}s/{c.content_id}"

        if c.content_type == "shared_post":
            target = shared_post_map.get(c.content_id)
            if not target:
                continue
            project_id = target[0]
            post_type = target[1]
            target_title = target[2]
            target_link = (
                f"/shared/feed/{c.content_id}"
                if post_type in {"kanban", "insight"}
                else f"/shared/articles/{c.content_id}"
            )
        elif c.content_type == "research_note":
            target = note_map.get(c.content_id)
            if not target:
                continue
            project_id = target[0]
            target_title = target[1]
            target_link = f"/research-notes/{c.content_id}"
        elif c.content_type == "schedule_event":
            target = schedule_map.get(c.content_id)
            if not target:
                continue
            project_id = target[0]
            target_title = target[1]
            target_link = "/schedule"
        else:
            continue

        if project_id not in membership_project_ids:
            continue

        events.append(
            {
                "id": f"comment:{c.id}",
                "actor_id": c.user_id,
                "action": "added_comment",
                "target_type": c.content_type,
                "target_id": c.content_id,
                "target_title": target_title,
                "target_link": target_link,
                "project_id": project_id,
                "created_at": c.created_at,
            }
        )
        user_ids.add(c.user_id)

    schedules = (
        db.query(ScheduleEvent)
        .filter(ScheduleEvent.project_id.in_(list(membership_project_ids)))
        .order_by(ScheduleEvent.created_at.desc())
        .limit(120)
        .all()
    )
    for s in schedules:
        events.append(
            {
                "id": f"schedule:{s.id}",
                "actor_id": s.created_by,
                "action": "created_schedule_event",
                "target_type": "schedule_event",
                "target_id": s.id,
                "target_title": s.title,
                "target_link": "/schedule",
                "project_id": s.project_id,
                "created_at": s.created_at,
            }
        )
        user_ids.add(s.created_by)

    authors = _authors_map(db, user_ids)
    event_project_ids = {
        row["project_id"]
        for row in events
        if isinstance(row.get("project_id"), UUID)
    }
    project_names = _project_name_map(db, event_project_ids)

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
            "project_id": row.get("project_id"),
            "project_name": project_names.get(row.get("project_id")),
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
            "total": len(events),
        },
    }
