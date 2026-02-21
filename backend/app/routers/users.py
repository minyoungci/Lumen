from __future__ import annotations

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user, require_admin
from app.models.bookmark import Bookmark
from app.models.comment import Comment
from app.models.research_note import ResearchNote
from app.models.shared_post import SharedPost
from app.models.user import UserProfile
from app.schemas.user import (
    UserAdminUpdate,
    UserMeOut,
    UserPublicOut,
    UserStats,
    UserUpdateMe,
)

router = APIRouter()



def _build_user_stats(db: Session, user_id: UUID) -> UserStats:
    notes_count = (
        db.query(func.count(ResearchNote.id))
        .filter(ResearchNote.user_id == user_id, ResearchNote.deleted_at.is_(None))
        .scalar()
        or 0
    )
    posts_count = (
        db.query(func.count(SharedPost.id))
        .filter(SharedPost.user_id == user_id, SharedPost.deleted_at.is_(None))
        .scalar()
        or 0
    )
    comments_count = (
        db.query(func.count(Comment.id))
        .filter(Comment.user_id == user_id, Comment.deleted_at.is_(None))
        .scalar()
        or 0
    )
    bookmarks_count = (
        db.query(func.count(Bookmark.id)).filter(Bookmark.user_id == user_id).scalar() or 0
    )

    return UserStats(
        notes_count=notes_count,
        posts_count=posts_count,
        comments_count=comments_count,
        bookmarks_count=bookmarks_count,
    )


@router.get("", response_model=dict)
def list_users(
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    q = db.query(UserProfile)
    if current_user.role != "admin":
        q = q.filter(UserProfile.is_active.is_(True))

    users = q.order_by(UserProfile.created_at.asc()).all()

    data = [
        UserPublicOut(
            id=u.id,
            display_name=u.display_name,
            avatar_url=u.avatar_url,
            bio=u.bio,
            role=u.role,
            is_active=u.is_active,
            stats=_build_user_stats(db, u.id),
        )
        for u in users
    ]
    return {"data": data}


@router.get("/me", response_model=dict)
def get_me(
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    user = db.query(UserProfile).filter(UserProfile.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return {
        "data": UserMeOut(
            id=user.id,
            email=None,
            display_name=user.display_name,
            avatar_url=user.avatar_url,
            bio=user.bio,
            role=user.role,
            is_active=user.is_active,
            storage_used=user.storage_used,
            stats=_build_user_stats(db, user.id),
            created_at=user.created_at,
        )
    }


@router.patch("/me", response_model=dict)
def update_me(
    payload: UserUpdateMe,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    user = db.query(UserProfile).filter(UserProfile.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    ALLOWED_USER_FIELDS = {"display_name", "bio", "avatar_url", "preferences"}
    updates = {
        k: v for k, v in payload.model_dump(exclude_unset=True).items()
        if k in ALLOWED_USER_FIELDS
    }
    for key, value in updates.items():
        setattr(user, key, value)

    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {
        "data": UserMeOut(
            id=user.id,
            email=None,
            display_name=user.display_name,
            avatar_url=user.avatar_url,
            bio=user.bio,
            role=user.role,
            is_active=user.is_active,
            storage_used=user.storage_used,
            stats=_build_user_stats(db, user.id),
            created_at=user.created_at,
        ),
        "message": "Profile updated",
    }


@router.get("/{user_id}", response_model=dict)
def get_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    user = db.query(UserProfile).filter(UserProfile.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return {
        "data": UserPublicOut(
            id=user.id,
            display_name=user.display_name,
            avatar_url=user.avatar_url,
            bio=user.bio,
            role=user.role,
            is_active=user.is_active,
            stats=_build_user_stats(db, user.id),
        )
    }


@router.patch("/{user_id}", response_model=dict)
def admin_update_user(
    user_id: UUID,
    payload: UserAdminUpdate,
    db: Session = Depends(get_db),
    _: RequestUser = Depends(require_admin),
):
    user = db.query(UserProfile).filter(UserProfile.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(user, key, value)

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "data": {
            "id": user.id,
            "display_name": user.display_name,
            "role": user.role,
            "is_active": user.is_active,
        },
        "message": "User updated",
    }
