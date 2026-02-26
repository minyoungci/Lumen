from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
import json
import urllib.error
import urllib.request
from typing import Any, Dict, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import RequestUser, require_admin
from app.models.ai_summary import AiSummary
from app.models.bookmark import Bookmark
from app.models.comment import Comment
from app.models.comment_reaction import CommentReaction
from app.models.daily_log import DailyLog
from app.models.mention import Mention
from app.models.note_version import NoteVersion
from app.models.notification import Notification
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.research_note import ResearchNote
from app.models.schedule import ScheduleEvent
from app.models.schedule_attendee import ScheduleEventAttendee
from app.models.shared_post import SharedPost
from app.models.site_setting import SiteSetting
from app.models.tag import Tag
from app.models.upload import Upload
from app.models.user import UserProfile
from app.utils.profile import resolve_avatar_url, resolve_member_color
from app.utils.site_config import configs_equal, deep_merge, ensure_site_config
from app.utils.security import is_admin_email


class MemberRoleUpdate(BaseModel):
    role: str  # "owner" | "member"


class SiteSettingsDraftUpdate(BaseModel):
    config: Dict[str, Any]
    mode: Literal["replace", "merge"] = "replace"

router = APIRouter()
SITE_SETTINGS_SCOPE = "global"


def _supabase_admin_request(method: str, path: str) -> Optional[dict]:
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        return None

    req = urllib.request.Request(
        f"{settings.SUPABASE_URL}{path}",
        method=method,
        headers={
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=6) as resp:
            raw = resp.read().decode()
        return json.loads(raw) if raw else {}
    except urllib.error.HTTPError:
        return None
    except Exception:
        return None


def _fetch_auth_email(user_id: UUID) -> Optional[str]:
    payload = _supabase_admin_request("GET", f"/auth/v1/admin/users/{user_id}")
    if not payload:
        return None

    if isinstance(payload.get("email"), str):
        return payload["email"]

    user = payload.get("user")
    if isinstance(user, dict) and isinstance(user.get("email"), str):
        return user["email"]

    return None


def _delete_auth_user(user_id: UUID) -> bool:
    payload = _supabase_admin_request("DELETE", f"/auth/v1/admin/users/{user_id}")
    return payload is not None


def _cleanup_user_rows(db: Session, user_id: UUID) -> dict:
    deleted: dict = {}

    deleted["project_memberships"] = (
        db.query(ProjectMember).filter(ProjectMember.user_id == user_id).delete(synchronize_session=False)
    )
    deleted["schedule_attending"] = (
        db.query(ScheduleEventAttendee)
        .filter(ScheduleEventAttendee.user_id == user_id)
        .delete(synchronize_session=False)
    )

    created_event_ids = [
        row[0] for row in db.query(ScheduleEvent.id).filter(ScheduleEvent.created_by == user_id).all()
    ]
    if created_event_ids:
        db.query(ScheduleEventAttendee).filter(
            ScheduleEventAttendee.event_id.in_(created_event_ids)
        ).delete(synchronize_session=False)
        deleted["created_schedule_events"] = (
            db.query(ScheduleEvent)
            .filter(ScheduleEvent.id.in_(created_event_ids))
            .delete(synchronize_session=False)
        )
    else:
        deleted["created_schedule_events"] = 0

    project_ids = [row[0] for row in db.query(Project.id).filter(Project.created_by_id == user_id).all()]
    if project_ids:
        deleted["owned_projects"] = (
            db.query(Project).filter(Project.id.in_(project_ids)).delete(synchronize_session=False)
        )
    else:
        deleted["owned_projects"] = 0

    deleted["daily_logs"] = db.query(DailyLog).filter(DailyLog.user_id == user_id).delete(synchronize_session=False)
    deleted["ai_summaries"] = db.query(AiSummary).filter(AiSummary.user_id == user_id).delete(synchronize_session=False)
    deleted["research_notes"] = (
        db.query(ResearchNote).filter(ResearchNote.user_id == user_id).delete(synchronize_session=False)
    )
    deleted["note_versions"] = (
        db.query(NoteVersion).filter(NoteVersion.user_id == user_id).delete(synchronize_session=False)
    )
    deleted["shared_posts"] = (
        db.query(SharedPost).filter(SharedPost.user_id == user_id).delete(synchronize_session=False)
    )
    deleted["comments"] = db.query(Comment).filter(Comment.user_id == user_id).delete(synchronize_session=False)
    deleted["comment_reactions"] = (
        db.query(CommentReaction).filter(CommentReaction.user_id == user_id).delete(synchronize_session=False)
    )
    deleted["bookmarks"] = db.query(Bookmark).filter(Bookmark.user_id == user_id).delete(synchronize_session=False)
    deleted["uploads"] = db.query(Upload).filter(Upload.user_id == user_id).delete(synchronize_session=False)
    deleted["mentions"] = (
        db.query(Mention)
        .filter(or_(Mention.mentioned_user == user_id, Mention.mentioned_by == user_id))
        .delete(synchronize_session=False)
    )
    deleted["notifications"] = (
        db.query(Notification).filter(Notification.user_id == user_id).delete(synchronize_session=False)
    )
    db.query(Notification).filter(Notification.actor_id == user_id).update(
        {Notification.actor_id: None},
        synchronize_session=False,
    )

    deleted["user_profiles"] = (
        db.query(UserProfile).filter(UserProfile.id == user_id).delete(synchronize_session=False)
    )
    return deleted


def _ensure_site_settings_row(db: Session) -> SiteSetting:
    row = db.query(SiteSetting).filter(SiteSetting.scope == SITE_SETTINGS_SCOPE).first()
    if row:
        return row

    defaults = ensure_site_config({})
    row = SiteSetting(
        scope=SITE_SETTINGS_SCOPE,
        published_config=defaults,
        draft_config=defaults,
        published_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _site_settings_payload(row: SiteSetting) -> dict:
    published_config = ensure_site_config(row.published_config)
    draft_config = ensure_site_config(row.draft_config)
    return {
        "published_config": published_config,
        "draft_config": draft_config,
        "has_unpublished_changes": not configs_equal(published_config, draft_config),
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "published_at": row.published_at.isoformat() if row.published_at else None,
        "updated_by": str(row.updated_by) if row.updated_by else None,
    }


@router.get("/site-settings", response_model=dict)
def admin_get_site_settings(
    db: Session = Depends(get_db),
    _: RequestUser = Depends(require_admin),
):
    row = _ensure_site_settings_row(db)
    return {"data": _site_settings_payload(row)}


@router.patch("/site-settings/draft", response_model=dict)
def admin_update_site_settings_draft(
    payload: SiteSettingsDraftUpdate,
    db: Session = Depends(get_db),
    current: RequestUser = Depends(require_admin),
):
    row = _ensure_site_settings_row(db)

    current_draft = ensure_site_config(row.draft_config)
    if payload.mode == "merge":
        next_raw = deep_merge(current_draft, payload.config)
    else:
        next_raw = payload.config

    row.draft_config = ensure_site_config(next_raw)
    row.updated_by = current.id

    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "data": _site_settings_payload(row),
        "message": "Draft site settings updated",
    }


@router.post("/site-settings/publish", response_model=dict)
def admin_publish_site_settings(
    db: Session = Depends(get_db),
    current: RequestUser = Depends(require_admin),
):
    row = _ensure_site_settings_row(db)

    row.published_config = ensure_site_config(row.draft_config)
    row.published_at = datetime.utcnow()
    row.updated_by = current.id

    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "data": _site_settings_payload(row),
        "message": "Site settings published",
    }


@router.post("/site-settings/reset-draft", response_model=dict)
def admin_reset_site_settings_draft(
    db: Session = Depends(get_db),
    current: RequestUser = Depends(require_admin),
):
    row = _ensure_site_settings_row(db)

    row.draft_config = ensure_site_config(row.published_config)
    row.updated_by = current.id

    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "data": _site_settings_payload(row),
        "message": "Draft reset to published settings",
    }


@router.get("/stats", response_model=dict)
def get_admin_stats(
    db: Session = Depends(get_db),
    _: RequestUser = Depends(require_admin),
):
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    today_start = datetime(now.year, now.month, now.day)

    users_total = db.query(func.count(UserProfile.id)).scalar() or 0
    users_active = db.query(func.count(UserProfile.id)).filter(UserProfile.is_active.is_(True)).scalar() or 0

    research_notes = (
        db.query(func.count(ResearchNote.id)).filter(ResearchNote.deleted_at.is_(None)).scalar() or 0
    )
    shared_posts_total = db.query(func.count(SharedPost.id)).filter(SharedPost.deleted_at.is_(None)).scalar() or 0
    kanban_cards = (
        db.query(func.count(SharedPost.id))
        .filter(SharedPost.deleted_at.is_(None), SharedPost.type == "kanban")
        .scalar()
        or 0
    )
    articles = (
        db.query(func.count(SharedPost.id))
        .filter(SharedPost.deleted_at.is_(None), SharedPost.type == "article")
        .scalar()
        or 0
    )
    comments_total = db.query(func.count(Comment.id)).filter(Comment.deleted_at.is_(None)).scalar() or 0
    tags_total = db.query(func.count(Tag.id)).scalar() or 0

    total_used_bytes = db.query(func.coalesce(func.sum(Upload.size_bytes), 0)).scalar() or 0
    total_files = db.query(func.count(Upload.id)).scalar() or 0

    posts_this_week = (
        db.query(func.count(SharedPost.id))
        .filter(SharedPost.deleted_at.is_(None), SharedPost.created_at >= week_ago)
        .scalar()
        or 0
    )
    comments_this_week = (
        db.query(func.count(Comment.id))
        .filter(Comment.deleted_at.is_(None), Comment.created_at >= week_ago)
        .scalar()
        or 0
    )

    active_note_users = {
        r[0]
        for r in db.query(ResearchNote.user_id)
        .filter(ResearchNote.updated_at >= today_start, ResearchNote.deleted_at.is_(None))
        .distinct()
        .all()
    }
    active_post_users = {
        r[0]
        for r in db.query(SharedPost.user_id)
        .filter(SharedPost.updated_at >= today_start, SharedPost.deleted_at.is_(None))
        .distinct()
        .all()
    }
    active_comment_users = {
        r[0]
        for r in db.query(Comment.user_id)
        .filter(Comment.created_at >= today_start, Comment.deleted_at.is_(None))
        .distinct()
        .all()
    }
    active_users_today = len(active_note_users | active_post_users | active_comment_users)

    return {
        "data": {
            "users": {"total": int(users_total), "active": int(users_active)},
            "content": {
                "research_notes": int(research_notes),
                "shared_posts": int(shared_posts_total),
                "kanban_cards": int(kanban_cards),
                "articles": int(articles),
                "comments": int(comments_total),
                "tags": int(tags_total),
            },
            "storage": {
                "total_used_bytes": int(total_used_bytes),
                "total_files": int(total_files),
            },
            "activity": {
                "posts_this_week": int(posts_this_week),
                "comments_this_week": int(comments_this_week),
                "active_users_today": int(active_users_today),
            },
        }
    }


@router.get("/storage", response_model=dict)
def get_storage_breakdown(
    db: Session = Depends(get_db),
    _: RequestUser = Depends(require_admin),
):
    users = db.query(UserProfile).order_by(UserProfile.display_name.asc()).all()

    data = []
    for user in users:
        uploads = db.query(Upload).filter(Upload.user_id == user.id).all()
        total_size = sum(u.size_bytes for u in uploads)
        files_count = len(uploads)

        breakdown = {
            "images": sum(u.size_bytes for u in uploads if u.file_type == "image"),
            "documents": sum(u.size_bytes for u in uploads if u.file_type == "document"),
            "code": sum(u.size_bytes for u in uploads if u.file_type == "code"),
            "other": sum(u.size_bytes for u in uploads if u.file_type == "other"),
        }

        data.append(
            {
                "user": {
                    "id": user.id,
                    "display_name": user.display_name,
                    "avatar_url": resolve_avatar_url(user.avatar_url),
                    "member_color": resolve_member_color(user.id, user.preferences),
                },
                "storage_used_bytes": int(total_size),
                "files_count": int(files_count),
                "breakdown": breakdown,
            }
        )

    return {"data": data}


@router.get("/users", response_model=dict)
def list_users_admin(
    db: Session = Depends(get_db),
    _: RequestUser = Depends(require_admin),
):
    users = db.query(UserProfile).order_by(UserProfile.display_name.asc()).all()

    memberships = db.query(ProjectMember).all()
    project_ids = {m.project_id for m in memberships}
    projects = db.query(Project).filter(Project.id.in_(project_ids)).all() if project_ids else []
    project_map = {p.id: p.name for p in projects}

    user_memberships: dict = defaultdict(list)
    for m in memberships:
        user_memberships[m.user_id].append({
            "project_id": str(m.project_id),
            "project_name": project_map.get(m.project_id, "Unknown"),
            "role": m.role,
            "joined_at": m.joined_at.isoformat() if m.joined_at else None,
        })

    data = []
    for user in users:
        data.append({
            "id": str(user.id),
            "display_name": user.display_name,
            "avatar_url": resolve_avatar_url(user.avatar_url),
            "member_color": resolve_member_color(user.id, user.preferences),
            "role": user.role,
            "is_active": user.is_active,
            "projects": user_memberships.get(user.id, []),
        })

    return {"data": data}


@router.patch("/projects/{project_id}/members/{user_id}", response_model=dict)
def admin_update_member_role(
    project_id: UUID,
    user_id: UUID,
    payload: MemberRoleUpdate,
    db: Session = Depends(get_db),
    _: RequestUser = Depends(require_admin),
):
    if payload.role not in ("owner", "member"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role must be 'owner' or 'member'")

    member = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    member.role = payload.role
    db.commit()
    return {"message": "Role updated"}


@router.delete("/projects/{project_id}/members/{user_id}", response_model=dict)
def admin_remove_member(
    project_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
    _: RequestUser = Depends(require_admin),
):
    member = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    try:
        db.delete(member)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {"message": "Member removed"}


@router.delete("/users/{user_id}", response_model=dict)
def admin_deactivate_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current: RequestUser = Depends(require_admin),
):
    if user_id == current.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot deactivate yourself")

    user = db.query(UserProfile).filter(UserProfile.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.role == "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot deactivate admin account")

    auth_email = _fetch_auth_email(user_id)
    if auth_email and is_admin_email(auth_email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot deactivate allowlisted admin account",
        )

    user.is_active = False
    db.commit()
    return {"message": "User deactivated"}


@router.patch("/users/{user_id}/activate", response_model=dict)
def admin_activate_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    _: RequestUser = Depends(require_admin),
):
    user = db.query(UserProfile).filter(UserProfile.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_active = True
    db.commit()
    return {"message": "User activated"}


@router.delete("/users/{user_id}/hard", response_model=dict)
def admin_hard_delete_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current: RequestUser = Depends(require_admin),
):
    if user_id == current.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete yourself")

    user = db.query(UserProfile).filter(UserProfile.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.role == "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete admin account")

    auth_email = _fetch_auth_email(user_id)
    if auth_email and is_admin_email(auth_email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete allowlisted admin account",
        )

    owner_project_ids = [
        row[0]
        for row in db.query(ProjectMember.project_id)
        .filter(
            ProjectMember.user_id == user_id,
            ProjectMember.role == "owner",
        )
        .all()
    ]
    if owner_project_ids:
        owned_projects = (
            db.query(Project.id, Project.name)
            .filter(Project.id.in_(owner_project_ids))
            .all()
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "OWNER_PROJECTS_EXIST",
                "message": "Transfer ownership before hard deleting this user.",
                "projects": [
                    {"id": str(project_id), "name": name}
                    for project_id, name in owned_projects
                ],
            },
        )

    auth_deleted = _delete_auth_user(user_id)
    try:
        deleted_rows = _cleanup_user_rows(db, user_id)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to hard delete user data")

    return {
        "message": "User permanently deleted",
        "data": {
            "user_id": str(user_id),
            "auth_deleted": bool(auth_deleted),
            "deleted_rows": deleted_rows,
        },
    }
