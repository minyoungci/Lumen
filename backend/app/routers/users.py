from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user, require_admin
from app.models.bookmark import Bookmark
from app.models.comment import Comment
from app.models.daily_log import DailyLog
from app.models.notification import Notification
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


class UserPreferencesUpdate(BaseModel):
    preferences: Dict[str, Any] = Field(default_factory=dict)


def _cache_bust_version(user: UserProfile) -> str:
    if user.updated_at:
        return str(int(user.updated_at.timestamp()))
    if user.created_at:
        return str(int(user.created_at.timestamp()))
    return "0"


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


def _extract_title_from_content(content: Any, fallback: str) -> str:
    if isinstance(content, dict):
        raw = content.get("title")
        if isinstance(raw, str) and raw.strip():
            return raw.strip()[:120]
    return fallback[:120]


def _extract_preview_from_content(content: Any, max_len: int = 140) -> str:
    if not isinstance(content, dict):
        return ""
    text = content.get("text")
    if isinstance(text, str) and text.strip():
        return text.strip()[:max_len]
    tiptap = content.get("tiptap")
    if isinstance(tiptap, dict):
        chunks: List[str] = []

        def walk(node: Any) -> None:
            if isinstance(node, dict):
                if node.get("type") == "text" and isinstance(node.get("text"), str):
                    chunks.append(node["text"])
                for value in node.values():
                    walk(value)
                return
            if isinstance(node, list):
                for item in node:
                    walk(item)

        walk(tiptap)
        merged = " ".join(part.strip() for part in chunks if part.strip())
        if merged:
            return merged[:max_len]
    return ""


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
        cache_bust_version=_cache_bust_version(user),
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


@router.get("/me/preferences", response_model=dict)
def get_me_preferences(
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    user = db.query(UserProfile).filter(UserProfile.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {
        "data": {
            "user_id": str(user.id),
            "preferences": preferences_for_response(user.id, user.preferences),
        }
    }


@router.patch("/me/preferences", response_model=dict)
def patch_me_preferences(
    payload: UserPreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    user = db.query(UserProfile).filter(UserProfile.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.preferences = merge_preferences(user.preferences, payload.preferences)
    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {
        "data": {
            "user_id": str(user.id),
            "preferences": preferences_for_response(user.id, user.preferences),
        },
        "message": "Preferences updated",
    }


@router.get("/me/dashboard", response_model=dict)
def get_me_dashboard(
    project_id: Optional[UUID] = Query(default=None),
    limit: int = Query(default=5, ge=1, le=20),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    user = db.query(UserProfile).filter(UserProfile.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if project_id is not None:
        _verify_project_access(db, project_id, current_user)

    today = date.today()

    daily_logs_q = db.query(DailyLog).filter(DailyLog.user_id == current_user.id)
    posts_q = db.query(SharedPost).filter(
        SharedPost.user_id == current_user.id,
        SharedPost.deleted_at.is_(None),
    )

    if project_id is not None:
        daily_logs_q = daily_logs_q.filter(DailyLog.project_id == project_id)
        posts_q = posts_q.filter(SharedPost.project_id == project_id)
    else:
        daily_logs_q = daily_logs_q.filter(DailyLog.project_id.is_(None))
        posts_q = posts_q.filter(SharedPost.project_id.is_(None))

    draft_logs = (
        daily_logs_q.filter(DailyLog.status == "draft")
        .order_by(DailyLog.updated_at.desc())
        .limit(limit)
        .all()
    )
    recent_logs = (
        daily_logs_q.order_by(DailyLog.updated_at.desc())
        .limit(limit)
        .all()
    )
    today_log = (
        daily_logs_q.filter(DailyLog.log_date == today).order_by(DailyLog.updated_at.desc()).first()
    )

    recent_posts = posts_q.order_by(SharedPost.updated_at.desc()).limit(limit).all()

    unread_rows = (
        db.query(Notification.type, func.count(Notification.id))
        .filter(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
        .group_by(Notification.type)
        .all()
    )
    notification_categories = {
        "comments": 0,
        "replies": 0,
        "reactions": 0,
        "mentions": 0,
        "system": 0,
        "other": 0,
    }
    unread_total = 0
    for notif_type, count in unread_rows:
        count_int = int(count or 0)
        unread_total += count_int
        category = _notification_category(str(notif_type or ""))
        notification_categories[category] = notification_categories.get(category, 0) + count_int

    continue_href = f"/daily-log?date={today.isoformat()}"
    continue_label = "오늘 Daily Log 이어쓰기"
    if draft_logs:
        continue_href = f"/daily-log?date={draft_logs[0].log_date.isoformat()}"
        continue_label = f"{draft_logs[0].log_date.isoformat()} 초안 이어쓰기"
    elif today_log is not None:
        continue_href = f"/daily-log?date={today.isoformat()}"
        continue_label = "오늘 작성 내용 이어쓰기"

    prefs = preferences_for_response(user.id, user.preferences)

    return {
        "data": {
            "profile": {
                "id": str(user.id),
                "display_name": user.display_name,
                "avatar_url": resolve_avatar_url(user.avatar_url),
                "member_color": resolve_member_color(user.id, user.preferences),
                "status_message": prefs.get("status_message"),
                "banner_text": prefs.get("banner_text"),
                "cache_bust_version": _cache_bust_version(user),
            },
            "continue_writing": {
                "href": continue_href,
                "label": continue_label,
                "has_draft": bool(draft_logs),
            },
            "notification_summary": {
                "unread_total": unread_total,
                "categories": notification_categories,
            },
            "drafts": {
                "daily_logs": [
                    {
                        "id": str(row.id),
                        "log_date": row.log_date.isoformat(),
                        "status": row.status,
                        "word_count": int(row.word_count or 0),
                        "title": _extract_title_from_content(row.content, f"{row.log_date.isoformat()} 로그"),
                        "preview": _extract_preview_from_content(row.content),
                        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
                    }
                    for row in draft_logs
                ]
            },
            "recent": {
                "daily_logs": [
                    {
                        "id": str(row.id),
                        "log_date": row.log_date.isoformat(),
                        "status": row.status,
                        "word_count": int(row.word_count or 0),
                        "title": _extract_title_from_content(row.content, f"{row.log_date.isoformat()} 로그"),
                        "preview": _extract_preview_from_content(row.content),
                        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
                    }
                    for row in recent_logs
                ],
                "posts": [
                    {
                        "id": str(row.id),
                        "type": row.type,
                        "title": row.title,
                        "preview": _extract_preview_from_content(row.content),
                        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
                        "project_id": str(row.project_id) if row.project_id else None,
                    }
                    for row in recent_posts
                ],
            },
            "stats": _build_user_stats(db, user.id).model_dump(),
            "preferences": prefs,
        }
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
