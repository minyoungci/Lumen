from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user
from app.models.bookmark import Bookmark
from app.models.daily_log import DailyLog
from app.models.research_note import ResearchNote
from app.models.shared_post import SharedPost
from app.models.user import UserProfile
from app.schemas.bookmark import BookmarkCreate, BookmarkOut

router = APIRouter()



def _resolve_content(db: Session, content_type: str, content_id: UUID):
    if content_type == "research_note":
        return db.query(ResearchNote).filter(ResearchNote.id == content_id, ResearchNote.deleted_at.is_(None)).first()
    if content_type == "shared_post":
        return db.query(SharedPost).filter(SharedPost.id == content_id, SharedPost.deleted_at.is_(None)).first()
    if content_type == "daily_log":
        return db.query(DailyLog).filter(DailyLog.id == content_id).first()
    return None



def _to_content_payload(db: Session, content_type: str, row):
    if row is None:
        return None

    author = None
    if hasattr(row, "user_id") and row.user_id:
        u = db.query(UserProfile).filter(UserProfile.id == row.user_id).first()
        if u:
            author = {"id": u.id, "display_name": u.display_name, "avatar_url": u.avatar_url}

    if content_type == "research_note":
        return {
            "id": row.id,
            "title": row.title,
            "type": "research_note",
            "author": author,
            "is_shared": row.is_shared,
        }
    if content_type == "shared_post":
        return {
            "id": row.id,
            "title": row.title,
            "type": row.type,
            "author": author,
        }
    if content_type == "daily_log":
        return {
            "id": row.id,
            "title": f"Daily Log {row.log_date.isoformat()}",
            "type": "daily_log",
            "author": author,
        }

    return None


@router.get("", response_model=dict)
def list_bookmarks(
    content_type: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    q = db.query(Bookmark).filter(Bookmark.user_id == current_user.id)
    if content_type:
        q = q.filter(Bookmark.content_type == content_type)

    if cursor:
        try:
            q = q.filter(Bookmark.id < UUID(cursor))
        except ValueError:
            pass

    rows = q.order_by(Bookmark.created_at.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = str(rows[-1].id) if has_more and rows else None

    data = []
    for row in rows:
        content = _resolve_content(db, row.content_type, row.content_id)
        data.append(
            BookmarkOut(
                id=row.id,
                content_type=row.content_type,
                content_id=row.content_id,
                content=_to_content_payload(db, row.content_type, content),
                created_at=row.created_at,
            )
        )

    return {
        "data": data,
        "pagination": {
            "has_more": has_more,
            "next_cursor": next_cursor,
            "total": len(data),
        },
    }


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_bookmark(
    payload: BookmarkCreate,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    if payload.content_type not in {"research_note", "shared_post", "daily_log"}:
        raise HTTPException(status_code=400, detail="Invalid content_type")

    content = _resolve_content(db, payload.content_type, payload.content_id)
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")

    existing = (
        db.query(Bookmark)
        .filter(
            Bookmark.user_id == current_user.id,
            Bookmark.content_type == payload.content_type,
            Bookmark.content_id == payload.content_id,
        )
        .first()
    )
    if existing:
        return {
            "data": BookmarkOut(
                id=existing.id,
                content_type=existing.content_type,
                content_id=existing.content_id,
                content=_to_content_payload(db, existing.content_type, content),
                created_at=existing.created_at,
            ),
            "message": "Already bookmarked",
        }

    row = Bookmark(user_id=current_user.id, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "data": BookmarkOut(
            id=row.id,
            content_type=row.content_type,
            content_id=row.content_id,
            content=_to_content_payload(db, row.content_type, content),
            created_at=row.created_at,
        ),
        "message": "Bookmarked",
    }


@router.delete("/{content_type}/{content_id}", response_model=dict)
def delete_bookmark(
    content_type: str,
    content_id: UUID,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    row = (
        db.query(Bookmark)
        .filter(
            Bookmark.user_id == current_user.id,
            Bookmark.content_type == content_type,
            Bookmark.content_id == content_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Bookmark not found")

    db.delete(row)
    db.commit()

    return {"data": {"deleted": True}, "message": "Bookmark removed"}
