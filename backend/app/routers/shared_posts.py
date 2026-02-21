from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user
from app.models.shared_post import SharedPost
from app.models.user import UserProfile
from app.schemas.shared_post import (
    SharedPostCreate,
    SharedPostListItem,
    SharedPostOut,
    SharedPostUpdate,
)

router = APIRouter()



def _extract_preview(content: dict, max_len: int = 140) -> str:
    if not isinstance(content, dict):
        return ""
    text = content.get("text")
    if isinstance(text, str):
        return text[:max_len]
    blocks = content.get("blocks")
    if isinstance(blocks, list):
        joined = " ".join(str(b.get("text", "")) for b in blocks if isinstance(b, dict))
        return joined[:max_len]
    return str(content)[:max_len]


@router.get("", response_model=dict)
def list_shared_posts(
    type: Optional[str] = Query(default=None),
    mine: bool = Query(default=False),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=500),
    cursor: Optional[str] = Query(default=None),
    project_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    q = db.query(SharedPost).filter(SharedPost.deleted_at.is_(None))

    if project_id is not None:
        from app.models.project_member import ProjectMember
        member = db.query(ProjectMember).filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == current_user.id,
        ).first()
        if not member:
            raise HTTPException(status_code=403, detail="Not a member of this project")
        q = q.filter(SharedPost.project_id == project_id)
    else:
        q = q.filter(SharedPost.project_id.is_(None))
        if mine:
            q = q.filter(SharedPost.user_id == current_user.id)
        else:
            q = q.filter(
                or_(
                    SharedPost.visibility == "shared",
                    SharedPost.user_id == current_user.id,
                )
            )

    if type:
        q = q.filter(SharedPost.type == type)
    if search:
        pattern = f"%{search}%"
        q = q.filter(or_(SharedPost.title.ilike(pattern)))

    if cursor:
        try:
            cursor_uuid = UUID(cursor)
            q = q.filter(SharedPost.id < cursor_uuid)
        except ValueError:
            pass

    rows = q.order_by(SharedPost.updated_at.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = str(rows[-1].id) if has_more and rows else None

    user_ids = list(set(row.user_id for row in rows))
    if user_ids:
        profiles = db.query(UserProfile).filter(UserProfile.id.in_(user_ids)).all()
        author_map = {p.id: p.display_name for p in profiles}
    else:
        author_map = {}

    data = [
        SharedPostListItem(
            id=row.id,
            type=row.type,
            title=row.title,
            preview=_extract_preview(row.content),
            kanban_column=row.kanban_column,
            kanban_order=row.kanban_order,
            is_pinned=row.is_pinned,
            view_count=row.view_count,
            author_name=author_map.get(row.user_id),
            created_at=row.created_at,
            visibility=getattr(row, "visibility", "shared"),
            updated_at=row.updated_at,
        )
        for row in rows
    ]

    return {
        "data": data,
        "pagination": {
            "has_more": has_more,
            "next_cursor": next_cursor,
            "total": len(data),
        },
    }


@router.get("/{post_id}", response_model=dict)
def get_shared_post(
    post_id: UUID,
    db: Session = Depends(get_db),
    _: RequestUser = Depends(get_current_user),
):
    row = (
        db.query(SharedPost)
        .filter(SharedPost.id == post_id, SharedPost.deleted_at.is_(None))
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared post not found")

    row.view_count = (row.view_count or 0) + 1
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {"data": SharedPostOut.model_validate(row)}


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_shared_post(
    payload: SharedPostCreate,
    project_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    row = SharedPost(user_id=current_user.id, project_id=project_id, **payload.model_dump())
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {"data": SharedPostOut.model_validate(row), "message": "Created"}


@router.patch("/{post_id}", response_model=dict)
def update_shared_post(
    post_id: UUID,
    payload: SharedPostUpdate,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    row = (
        db.query(SharedPost)
        .filter(SharedPost.id == post_id, SharedPost.deleted_at.is_(None))
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared post not found")
    if row.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only author/admin can update")

    ALLOWED_POST_FIELDS = {"title", "content", "type", "is_pinned", "kanban_column", "kanban_order", "visibility"}
    updates = {
        k: v for k, v in payload.model_dump(exclude_unset=True).items()
        if k in ALLOWED_POST_FIELDS
    }
    for key, value in updates.items():
        setattr(row, key, value)

    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {"data": SharedPostOut.model_validate(row), "message": "Updated"}


@router.delete("/{post_id}", response_model=dict)
def delete_shared_post(
    post_id: UUID,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    row = db.query(SharedPost).filter(SharedPost.id == post_id).first()
    if not row or row.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared post not found")
    if row.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only author/admin can delete")

    from datetime import datetime

    row.deleted_at = datetime.utcnow()
    try:
        db.add(row)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {"message": "Deleted"}
