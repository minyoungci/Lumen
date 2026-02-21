from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user
from app.models.comment import Comment
from app.models.user import UserProfile
from app.schemas.comment import CommentAuthor, CommentCreate, CommentOut, CommentUpdate

router = APIRouter()



def _author_map(db: Session, user_ids: List[UUID]) -> Dict[UUID, CommentAuthor]:
    if not user_ids:
        return {}

    rows = db.query(UserProfile).filter(UserProfile.id.in_(list(set(user_ids)))).all()
    return {
        r.id: CommentAuthor(id=r.id, display_name=r.display_name, avatar_url=r.avatar_url)
        for r in rows
    }



def _to_comment_out(
    row: Comment,
    author: Optional[CommentAuthor],
    replies: Optional[List[CommentOut]] = None,
) -> CommentOut:
    return CommentOut(
        id=row.id,
        author=author or CommentAuthor(id=row.user_id, display_name="Unknown"),
        body=row.body,
        parent_id=row.parent_id,
        is_edited=row.is_edited,
        replies=replies or [],
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=dict)
def list_comments(
    content_type: str = Query(...),
    content_id: UUID = Query(...),
    limit: int = Query(default=50, ge=1, le=100),
    cursor: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _: RequestUser = Depends(get_current_user),
):
    q = db.query(Comment).filter(
        Comment.content_type == content_type,
        Comment.content_id == content_id,
        Comment.parent_id.is_(None),
        Comment.deleted_at.is_(None),
    )

    if cursor:
        try:
            q = q.filter(Comment.id < UUID(cursor))
        except ValueError:
            pass

    parents = q.order_by(Comment.created_at.desc()).limit(limit + 1).all()

    has_more = len(parents) > limit
    parents = parents[:limit]
    next_cursor = str(parents[-1].id) if has_more and parents else None

    parent_ids = [p.id for p in parents]
    replies = []
    if parent_ids:
        replies = (
            db.query(Comment)
            .filter(Comment.parent_id.in_(parent_ids), Comment.deleted_at.is_(None))
            .order_by(Comment.created_at.asc())
            .all()
        )

    all_user_ids = [p.user_id for p in parents] + [r.user_id for r in replies]
    authors = _author_map(db, all_user_ids)

    replies_by_parent: Dict[UUID, List[CommentOut]] = {}
    for reply in replies:
        replies_by_parent.setdefault(reply.parent_id, []).append(
            _to_comment_out(reply, authors.get(reply.user_id))
        )

    data = [
        _to_comment_out(parent, authors.get(parent.user_id), replies_by_parent.get(parent.id, []))
        for parent in parents
    ]

    return {
        "data": data,
        "pagination": {
            "has_more": has_more,
            "next_cursor": next_cursor,
            "total": len(data),
        },
    }


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_comment(
    payload: CommentCreate,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    if payload.parent_id:
        parent = db.query(Comment).filter(Comment.id == payload.parent_id).first()
        if not parent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent comment not found")

    row = Comment(
        user_id=current_user.id,
        content_type=payload.content_type,
        content_id=payload.content_id,
        parent_id=payload.parent_id,
        body=payload.body,
    )
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    author = db.query(UserProfile).filter(UserProfile.id == current_user.id).first()

    return {
        "data": _to_comment_out(
            row,
            CommentAuthor(
                id=current_user.id,
                display_name=author.display_name if author else "Unknown",
                avatar_url=author.avatar_url if author else None,
            ),
        ),
        "message": "Comment added",
    }


@router.patch("/{comment_id}", response_model=dict)
def update_comment(
    comment_id: UUID,
    payload: CommentUpdate,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    row = db.query(Comment).filter(Comment.id == comment_id, Comment.deleted_at.is_(None)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    if row.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can edit")

    row.body = payload.body
    row.is_edited = True
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    author = db.query(UserProfile).filter(UserProfile.id == current_user.id).first()

    return {
        "data": _to_comment_out(
            row,
            CommentAuthor(
                id=current_user.id,
                display_name=author.display_name if author else "Unknown",
                avatar_url=author.avatar_url if author else None,
            ),
        ),
        "message": "Comment updated",
    }


@router.delete("/{comment_id}", response_model=dict)
def delete_comment(
    comment_id: UUID,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    row = db.query(Comment).filter(Comment.id == comment_id, Comment.deleted_at.is_(None)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    if row.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner/admin can delete")

    row.deleted_at = datetime.utcnow()
    try:
        db.add(row)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {"data": {"deleted": True}, "message": "Comment deleted"}
