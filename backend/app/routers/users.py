from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user, require_admin
from app.models.bookmark import Bookmark
from app.models.comment import Comment
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.research_note import ResearchNote
from app.models.shared_post import SharedPost
from app.models.upload import Upload
from app.models.user import UserProfile
from app.schemas.user import (
    UserAdminUpdate,
    UserMeOut,
    UserPublicOut,
    UserStats,
    UserUpdateMe,
)
from app.services.storage_service import storage_service
from app.utils.profile import (
    merge_preferences,
    normalize_avatar_url,
    preferences_for_response,
    resolve_avatar_url,
    resolve_member_color,
)
from app.utils.upload_rules import (
    MAX_FILE_SIZE,
    ensure_within_size_limit,
    extension,
    resolve_upload_content_type,
)

router = APIRouter()


def _verify_project_access(
    db: Session,
    project_id: UUID,
    current_user: RequestUser,
) -> None:
    project_exists = db.query(Project.id).filter(Project.id == project_id).first()
    if not project_exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if current_user.role == "admin":
        return

    member = (
        db.query(ProjectMember.id)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == current_user.id,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this project")


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


def _clean_text(value: Any, field_name: str, limit: int) -> str:
    if not isinstance(value, str):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} must be a string")
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} cannot be empty")
    return cleaned[:limit]


def _to_public_user_out(db: Session, user: UserProfile) -> UserPublicOut:
    return UserPublicOut(
        id=user.id,
        display_name=user.display_name,
        avatar_url=resolve_avatar_url(user.avatar_url),
        bio=user.bio,
        role=user.role,
        is_active=user.is_active,
        member_color=resolve_member_color(user.id, user.preferences),
        stats=_build_user_stats(db, user.id),
    )


def _to_me_user_out(db: Session, user: UserProfile) -> UserMeOut:
    return UserMeOut(
        id=user.id,
        email=None,
        display_name=user.display_name,
        avatar_url=resolve_avatar_url(user.avatar_url),
        bio=user.bio,
        role=user.role,
        is_active=user.is_active,
        storage_used=user.storage_used,
        member_color=resolve_member_color(user.id, user.preferences),
        preferences=preferences_for_response(user.id, user.preferences),
        stats=_build_user_stats(db, user.id),
        created_at=user.created_at,
    )


@router.get("", response_model=dict)
def list_users(
    scope: str = Query(default="auto"),
    project_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    normalized_scope = (scope or "auto").strip().lower()
    if normalized_scope not in {"auto", "project", "personal", "all"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid scope")
    if normalized_scope == "all" and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin scope required")

    if normalized_scope == "personal":
        q = db.query(UserProfile).filter(UserProfile.id == current_user.id)
    elif normalized_scope == "all":
        q = db.query(UserProfile)
    else:
        target_project_id = project_id
        if normalized_scope == "project" and target_project_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="project_id is required when scope=project",
            )

        if target_project_id is None:
            if current_user.role == "admin":
                q = db.query(UserProfile)
            else:
                q = db.query(UserProfile).filter(UserProfile.id == current_user.id)
        else:
            _verify_project_access(db, target_project_id, current_user)
            member_user_ids = [
                row[0]
                for row in db.query(ProjectMember.user_id)
                .filter(ProjectMember.project_id == target_project_id)
                .all()
            ]
            if not member_user_ids:
                return {"data": []}
            q = db.query(UserProfile).filter(UserProfile.id.in_(member_user_ids))

    if current_user.role != "admin":
        q = q.filter(UserProfile.is_active.is_(True))

    users = q.order_by(UserProfile.display_name.asc()).all()

    data = [_to_public_user_out(db, u) for u in users]
    return {"data": data}


@router.get("/me", response_model=dict)
def get_me(
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    user = db.query(UserProfile).filter(UserProfile.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return {"data": _to_me_user_out(db, user)}


@router.patch("/me", response_model=dict)
def update_me(
    payload: UserUpdateMe,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    user = db.query(UserProfile).filter(UserProfile.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    updates: Dict[str, Any] = payload.model_dump(exclude_unset=True)
    if "display_name" in updates:
        user.display_name = _clean_text(updates["display_name"], "display_name", 100)
    if "bio" in updates:
        bio_value = updates["bio"]
        if bio_value is None:
            user.bio = None
        elif isinstance(bio_value, str):
            user.bio = bio_value.strip()[:500]
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="bio must be a string")
    if "avatar_url" in updates:
        avatar_value = updates["avatar_url"]
        if avatar_value is not None and not isinstance(avatar_value, str):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="avatar_url must be a string")
        user.avatar_url = normalize_avatar_url(avatar_value)
    if "preferences" in updates:
        user.preferences = merge_preferences(user.preferences, updates["preferences"])

    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {
        "data": _to_me_user_out(db, user),
        "message": "Profile updated",
    }


@router.post("/me/avatar", response_model=dict, status_code=status.HTTP_201_CREATED)
async def upload_me_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    user = db.query(UserProfile).filter(UserProfile.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    content = await file.read()
    ensure_within_size_limit(content, MAX_FILE_SIZE)

    original_name = file.filename or ""
    normalized_file_type, resolved_content_type = resolve_upload_content_type(
        file_type="image",
        filename=original_name,
        content_type=file.content_type,
        content=content,
    )
    ext = extension(original_name)
    upload_key = uuid4().hex
    filename = f"{upload_key}{ext}"

    try:
        stored = storage_service.upload_user_upload(
            user_id=current_user.id,
            upload_key=upload_key,
            filename=filename,
            content=content,
            content_type=resolved_content_type,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    row = Upload(
        user_id=current_user.id,
        filename=filename,
        original_name=original_name or filename,
        mime_type=resolved_content_type,
        size_bytes=len(content),
        storage_path=stored.storage_path,
        public_url=stored.public_url,
        file_type=normalized_file_type,
        context_type="profile_avatar",
        context_id=current_user.id,
    )
    user.avatar_url = normalize_avatar_url(stored.public_url)

    try:
        db.add(row)
        db.add(user)
        db.commit()
        db.refresh(user)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save avatar")

    return {
        "data": _to_me_user_out(db, user),
        "message": "Avatar updated",
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

    return {"data": _to_public_user_out(db, user)}


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
    if updates.get("role") == "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role promotion to admin is restricted by email allowlist",
        )
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
