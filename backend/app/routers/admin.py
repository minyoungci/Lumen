from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
import json
from pathlib import Path
import urllib.error
import urllib.request
from urllib.parse import unquote, urlparse
from typing import Any, Dict, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
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
from app.services.storage_service import SUPABASE_UPLOAD_URI_PREFIX, storage_service
from app.utils.profile import resolve_avatar_url, resolve_member_color
from app.utils.site_config import configs_equal, deep_merge, ensure_site_config
from app.utils.security import is_admin_email
from app.utils.upload_rules import ensure_within_size_limit, resolve_upload_content_type


class MemberRoleUpdate(BaseModel):
    role: str  # "owner" | "member"


class SiteSettingsDraftUpdate(BaseModel):
    config: Dict[str, Any]
    mode: Literal["replace", "merge"] = "replace"


class StorageIntegrityRepairRequest(BaseModel):
    upload_limit: int = 1000
    shared_post_limit: int = 1000


class StorageMissingUploadListResponse(BaseModel):
    upload_id: str
    user_id: str
    original_name: str
    mime_type: str
    file_type: str
    size_bytes: int
    object_path: str
    missing_supabase: bool
    missing_local_backup: bool
    created_at: Optional[str] = None


router = APIRouter()
SITE_SETTINGS_SCOPE = "global"
LOCAL_UPLOAD_URL_PREFIX = "/uploads/files/"


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


def _upload_object_path(row: Upload) -> Optional[str]:
    for candidate in (row.public_url, row.storage_path):
        canonical = storage_service.canonicalize_upload_url(candidate)
        if isinstance(canonical, str) and canonical.startswith(SUPABASE_UPLOAD_URI_PREFIX):
            object_path = canonical.removeprefix(SUPABASE_UPLOAD_URI_PREFIX).strip()
            if object_path:
                return object_path

    public_url = (row.public_url or "").strip()
    if public_url.startswith(LOCAL_UPLOAD_URL_PREFIX):
        relative = unquote(public_url[len(LOCAL_UPLOAD_URL_PREFIX):]).lstrip("/")
        if relative:
            return relative

    storage_path = (row.storage_path or "").strip()
    if storage_path:
        try:
            relative = Path(storage_path).resolve().relative_to(Path(settings.UPLOAD_DIR).resolve())
            normalized = str(relative).replace("\\", "/")
            if normalized and normalized != ".":
                return normalized
        except Exception:
            return None

    return None


def _collect_image_sources(node: Any, out: list[str]) -> None:
    if isinstance(node, dict):
        if node.get("type") == "image":
            attrs = node.get("attrs")
            if isinstance(attrs, dict):
                src = attrs.get("src")
                if isinstance(src, str) and src.strip():
                    out.append(src.strip())
        for value in node.values():
            _collect_image_sources(value, out)
        return

    if isinstance(node, list):
        for item in node:
            _collect_image_sources(item, out)


def _media_source_object_path(src: str) -> Optional[str]:
    cleaned = src.strip()
    if not cleaned:
        return None

    canonical = storage_service.canonicalize_upload_url(cleaned)
    if isinstance(canonical, str) and canonical.startswith(SUPABASE_UPLOAD_URI_PREFIX):
        object_path = canonical.removeprefix(SUPABASE_UPLOAD_URI_PREFIX).strip()
        return object_path or None

    parsed = urlparse(canonical or cleaned)
    path = parsed.path or cleaned
    if path.startswith(LOCAL_UPLOAD_URL_PREFIX):
        object_path = unquote(path[len(LOCAL_UPLOAD_URL_PREFIX):]).lstrip("/")
        return object_path or None

    return None


def _build_storage_integrity_report(
    db: Session,
    upload_limit: int,
    shared_post_limit: int,
) -> dict:
    upload_rows = (
        db.query(Upload)
        .order_by(Upload.created_at.desc())
        .limit(upload_limit)
        .all()
    )

    status_cache: dict[str, tuple[bool, bool]] = {}
    missing_samples: list[dict[str, str]] = []
    unresolved_samples: list[dict[str, str]] = []

    upload_counts = {
        "scanned": len(upload_rows),
        "resolved_paths": 0,
        "unresolved_paths": 0,
        "present_in_supabase": 0,
        "present_in_local_backup": 0,
        "present_in_both": 0,
        "missing_in_supabase": 0,
        "missing_in_local_backup": 0,
        "missing_in_both": 0,
    }

    def _status_for_path(object_path: str) -> tuple[bool, bool]:
        if object_path in status_cache:
            return status_cache[object_path]
        supabase_exists = storage_service.supabase_object_exists(object_path)
        local_exists = storage_service.local_backup_exists(object_path)
        status_cache[object_path] = (supabase_exists, local_exists)
        return status_cache[object_path]

    for row in upload_rows:
        object_path = _upload_object_path(row)
        if not object_path:
            upload_counts["unresolved_paths"] += 1
            if len(unresolved_samples) < 20:
                unresolved_samples.append(
                    {
                        "upload_id": str(row.id),
                        "filename": row.original_name,
                    }
                )
            continue

        upload_counts["resolved_paths"] += 1
        supabase_exists, local_exists = _status_for_path(object_path)

        if supabase_exists:
            upload_counts["present_in_supabase"] += 1
        if local_exists:
            upload_counts["present_in_local_backup"] += 1
        if supabase_exists and local_exists:
            upload_counts["present_in_both"] += 1
        if not supabase_exists:
            upload_counts["missing_in_supabase"] += 1
        if not local_exists:
            upload_counts["missing_in_local_backup"] += 1
        if not supabase_exists and not local_exists:
            upload_counts["missing_in_both"] += 1
            if len(missing_samples) < 20:
                missing_samples.append(
                    {
                        "upload_id": str(row.id),
                        "filename": row.original_name,
                        "object_path": object_path,
                    }
                )

    post_rows = (
        db.query(SharedPost.id, SharedPost.title, SharedPost.content)
        .filter(SharedPost.deleted_at.is_(None))
        .order_by(SharedPost.updated_at.desc())
        .limit(shared_post_limit)
        .all()
    )

    shared_paths: set[str] = set()
    shared_missing_paths: set[str] = set()
    shared_missing_samples: list[dict[str, str]] = []

    for post_id, title, content in post_rows:
        sources: list[str] = []
        _collect_image_sources(content, sources)
        for source in sources:
            object_path = _media_source_object_path(source)
            if not object_path:
                continue
            shared_paths.add(object_path)
            supabase_exists, local_exists = _status_for_path(object_path)
            if supabase_exists or local_exists:
                continue
            shared_missing_paths.add(object_path)
            if len(shared_missing_samples) < 20:
                shared_missing_samples.append(
                    {
                        "post_id": str(post_id),
                        "post_title": title or "",
                        "object_path": object_path,
                    }
                )

    return {
        "uploads": upload_counts,
        "shared_media": {
            "scanned_posts": len(post_rows),
            "unique_paths": len(shared_paths),
            "missing_paths": len(shared_missing_paths),
            "missing_samples": shared_missing_samples,
        },
        "samples": {
            "upload_missing_both": missing_samples,
            "upload_unresolved_path": unresolved_samples,
        },
    }


def _repair_storage_integrity_internal(
    db: Session,
    upload_limit: int,
    shared_post_limit: int,
) -> dict:
    upload_rows = (
        db.query(Upload)
        .order_by(Upload.created_at.desc())
        .limit(upload_limit)
        .all()
    )

    object_mime_map: dict[str, Optional[str]] = {}
    unresolved_uploads = 0
    for row in upload_rows:
        object_path = _upload_object_path(row)
        if not object_path:
            unresolved_uploads += 1
            continue
        existing_mime = object_mime_map.get(object_path)
        if existing_mime:
            continue
        object_mime_map[object_path] = row.mime_type

    repaired_supabase = 0
    repaired_local_backup = 0
    failed_repairs: list[dict[str, str]] = []

    for object_path, mime_type in object_mime_map.items():
        supabase_exists = storage_service.supabase_object_exists(object_path)
        local_exists = storage_service.local_backup_exists(object_path)

        if local_exists and not supabase_exists:
            restored = storage_service.restore_supabase_from_local_backup(
                object_path=object_path,
                content_type=mime_type,
            )
            if restored:
                repaired_supabase += 1
                supabase_exists = True
            elif len(failed_repairs) < 30:
                failed_repairs.append(
                    {
                        "object_path": object_path,
                        "reason": "Failed to restore Supabase object from local backup",
                    }
                )

        if supabase_exists and not local_exists:
            restored = storage_service.restore_local_backup_from_supabase(object_path=object_path)
            if restored:
                repaired_local_backup += 1
            elif len(failed_repairs) < 30:
                failed_repairs.append(
                    {
                        "object_path": object_path,
                        "reason": "Failed to restore local backup from Supabase object",
                    }
                )

    after_report = _build_storage_integrity_report(
        db=db,
        upload_limit=upload_limit,
        shared_post_limit=shared_post_limit,
    )

    return {
        "scanned_uploads": len(upload_rows),
        "scanned_object_paths": len(object_mime_map),
        "unresolved_uploads": unresolved_uploads,
        "repaired_supabase_objects": repaired_supabase,
        "repaired_local_backups": repaired_local_backup,
        "failed_repairs": failed_repairs,
        "integrity_after": after_report,
    }


def _list_missing_uploads(
    db: Session,
    limit: int,
    mode: Literal["both", "supabase", "local", "any"],
) -> list[StorageMissingUploadListResponse]:
    rows = (
        db.query(Upload)
        .order_by(Upload.created_at.desc())
        .limit(limit)
        .all()
    )

    data: list[StorageMissingUploadListResponse] = []
    for row in rows:
        object_path = _upload_object_path(row)
        if not object_path:
            continue

        missing_supabase = not storage_service.supabase_object_exists(object_path)
        missing_local = not storage_service.local_backup_exists(object_path)

        if mode == "both" and not (missing_supabase and missing_local):
            continue
        if mode == "supabase" and not missing_supabase:
            continue
        if mode == "local" and not missing_local:
            continue
        if mode == "any" and not (missing_supabase or missing_local):
            continue

        data.append(
            StorageMissingUploadListResponse(
                upload_id=str(row.id),
                user_id=str(row.user_id),
                original_name=row.original_name,
                mime_type=row.mime_type,
                file_type=row.file_type,
                size_bytes=int(row.size_bytes),
                object_path=object_path,
                missing_supabase=missing_supabase,
                missing_local_backup=missing_local,
                created_at=row.created_at.isoformat() if row.created_at else None,
            )
        )

    return data


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


@router.get("/storage/integrity", response_model=dict)
def get_storage_integrity(
    upload_limit: int = Query(default=1000, ge=1, le=5000),
    shared_post_limit: int = Query(default=1000, ge=1, le=5000),
    db: Session = Depends(get_db),
    _: RequestUser = Depends(require_admin),
):
    report = _build_storage_integrity_report(
        db=db,
        upload_limit=upload_limit,
        shared_post_limit=shared_post_limit,
    )
    return {"data": report}


@router.post("/storage/integrity/repair", response_model=dict)
def repair_storage_integrity(
    payload: StorageIntegrityRepairRequest,
    db: Session = Depends(get_db),
    _: RequestUser = Depends(require_admin),
):
    upload_limit = min(max(payload.upload_limit, 1), 5000)
    shared_post_limit = min(max(payload.shared_post_limit, 1), 5000)
    result = _repair_storage_integrity_internal(
        db=db,
        upload_limit=upload_limit,
        shared_post_limit=shared_post_limit,
    )

    return {
        "message": "Storage integrity repair completed",
        "data": result,
    }


@router.get("/storage/missing-uploads", response_model=dict)
def list_missing_uploads(
    mode: Literal["both", "supabase", "local", "any"] = Query(default="both"),
    limit: int = Query(default=500, ge=1, le=5000),
    db: Session = Depends(get_db),
    _: RequestUser = Depends(require_admin),
):
    rows = _list_missing_uploads(db=db, limit=limit, mode=mode)
    return {
        "data": [row.model_dump() for row in rows],
        "pagination": {
            "total": len(rows),
            "limit": limit,
            "mode": mode,
        },
    }


@router.post("/storage/missing-uploads/{upload_id}/reupload", response_model=dict)
async def reupload_missing_upload(
    upload_id: UUID,
    file: Optional[UploadFile] = File(default=None),
    db: Session = Depends(get_db),
    _: RequestUser = Depends(require_admin),
):
    row = db.query(Upload).filter(Upload.id == upload_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")

    object_path = _upload_object_path(row)
    if not object_path:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Upload object path could not be resolved",
        )

    supabase_exists = storage_service.supabase_object_exists(object_path)
    local_exists = storage_service.local_backup_exists(object_path)
    if supabase_exists and local_exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Upload already healthy in Supabase and local backup",
        )

    if local_exists and not supabase_exists:
        if storage_service.restore_supabase_from_local_backup(object_path=object_path, content_type=row.mime_type):
            return {
                "data": {
                    "upload_id": str(row.id),
                    "object_path": object_path,
                    "restored_from": "local_backup",
                },
                "message": "Supabase object restored from local backup",
            }
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to restore Supabase object from local backup",
        )

    if supabase_exists and not local_exists:
        if storage_service.restore_local_backup_from_supabase(object_path=object_path):
            return {
                "data": {
                    "upload_id": str(row.id),
                    "object_path": object_path,
                    "restored_from": "supabase",
                },
                "message": "Local backup restored from Supabase object",
            }
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to restore local backup from Supabase object",
        )

    # Both missing: require admin to provide the original file for re-upload.
    if file is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is required when both Supabase and local backup are missing",
        )

    content = await file.read()
    ensure_within_size_limit(content)
    normalized_file_type, resolved_content_type = resolve_upload_content_type(
        file_type=row.file_type,
        filename=file.filename or row.original_name,
        content_type=file.content_type,
        content=content,
    )
    if normalized_file_type != row.file_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Uploaded file_type '{normalized_file_type}' does not match original '{row.file_type}'",
        )

    success = storage_service.put_object(
        object_path=object_path,
        content=content,
        content_type=resolved_content_type,
        upsert=True,
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to upload file to storage",
        )

    row.mime_type = resolved_content_type
    row.size_bytes = len(content)
    row.public_url = f"{SUPABASE_UPLOAD_URI_PREFIX}{object_path}"
    row.storage_path = f"{SUPABASE_UPLOAD_URI_PREFIX}{object_path}"
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "data": {
            "upload_id": str(row.id),
            "object_path": object_path,
            "mime_type": row.mime_type,
            "size_bytes": row.size_bytes,
        },
        "message": "Missing upload re-uploaded successfully",
    }


@router.get("/users", response_model=dict)
def list_users_admin(
    window_days: int = Query(default=7, ge=1, le=90),
    db: Session = Depends(get_db),
    _: RequestUser = Depends(require_admin),
):
    users = db.query(UserProfile).order_by(UserProfile.display_name.asc()).all()
    window_start = datetime.utcnow() - timedelta(days=window_days)

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

    note_counts = {
        row[0]: int(row[1] or 0)
        for row in (
            db.query(ResearchNote.user_id, func.count(ResearchNote.id))
            .filter(ResearchNote.deleted_at.is_(None))
            .group_by(ResearchNote.user_id)
            .all()
        )
        if row[0] is not None
    }
    note_recent_counts = {
        row[0]: int(row[1] or 0)
        for row in (
            db.query(ResearchNote.user_id, func.count(ResearchNote.id))
            .filter(ResearchNote.deleted_at.is_(None), ResearchNote.created_at >= window_start)
            .group_by(ResearchNote.user_id)
            .all()
        )
        if row[0] is not None
    }

    shared_counts = {
        row[0]: int(row[1] or 0)
        for row in (
            db.query(SharedPost.user_id, func.count(SharedPost.id))
            .filter(SharedPost.deleted_at.is_(None))
            .group_by(SharedPost.user_id)
            .all()
        )
        if row[0] is not None
    }
    shared_recent_counts = {
        row[0]: int(row[1] or 0)
        for row in (
            db.query(SharedPost.user_id, func.count(SharedPost.id))
            .filter(SharedPost.deleted_at.is_(None), SharedPost.created_at >= window_start)
            .group_by(SharedPost.user_id)
            .all()
        )
        if row[0] is not None
    }

    comment_counts = {
        row[0]: int(row[1] or 0)
        for row in (
            db.query(Comment.user_id, func.count(Comment.id))
            .filter(Comment.deleted_at.is_(None))
            .group_by(Comment.user_id)
            .all()
        )
        if row[0] is not None
    }
    comment_recent_counts = {
        row[0]: int(row[1] or 0)
        for row in (
            db.query(Comment.user_id, func.count(Comment.id))
            .filter(Comment.deleted_at.is_(None), Comment.created_at >= window_start)
            .group_by(Comment.user_id)
            .all()
        )
        if row[0] is not None
    }

    daily_counts = {
        row[0]: int(row[1] or 0)
        for row in (
            db.query(DailyLog.user_id, func.count(DailyLog.id))
            .group_by(DailyLog.user_id)
            .all()
        )
        if row[0] is not None
    }
    daily_recent_counts = {
        row[0]: int(row[1] or 0)
        for row in (
            db.query(DailyLog.user_id, func.count(DailyLog.id))
            .filter(DailyLog.created_at >= window_start)
            .group_by(DailyLog.user_id)
            .all()
        )
        if row[0] is not None
    }

    last_active_map: dict[UUID, datetime] = {}

    def merge_last_activity(rows: list[tuple[UUID, Optional[datetime]]]) -> None:
        for user_id, last_seen in rows:
            if user_id is None or last_seen is None:
                continue
            existing = last_active_map.get(user_id)
            if existing is None or last_seen > existing:
                last_active_map[user_id] = last_seen

    merge_last_activity(
        (
            db.query(ResearchNote.user_id, func.max(func.coalesce(ResearchNote.updated_at, ResearchNote.created_at)))
            .filter(ResearchNote.deleted_at.is_(None))
            .group_by(ResearchNote.user_id)
            .all()
        )
    )
    merge_last_activity(
        (
            db.query(SharedPost.user_id, func.max(func.coalesce(SharedPost.updated_at, SharedPost.created_at)))
            .filter(SharedPost.deleted_at.is_(None))
            .group_by(SharedPost.user_id)
            .all()
        )
    )
    merge_last_activity(
        (
            db.query(Comment.user_id, func.max(func.coalesce(Comment.updated_at, Comment.created_at)))
            .filter(Comment.deleted_at.is_(None))
            .group_by(Comment.user_id)
            .all()
        )
    )
    merge_last_activity(
        (
            db.query(DailyLog.user_id, func.max(func.coalesce(DailyLog.updated_at, DailyLog.created_at)))
            .group_by(DailyLog.user_id)
            .all()
        )
    )

    data = []
    for user in users:
        notes_total = note_counts.get(user.id, 0)
        shared_total = shared_counts.get(user.id, 0)
        comments_total = comment_counts.get(user.id, 0)
        daily_total = daily_counts.get(user.id, 0)

        notes_recent = note_recent_counts.get(user.id, 0)
        shared_recent = shared_recent_counts.get(user.id, 0)
        comments_recent = comment_recent_counts.get(user.id, 0)
        daily_recent = daily_recent_counts.get(user.id, 0)

        activity_total = notes_total + shared_total + comments_total + daily_total
        activity_recent_total = notes_recent + shared_recent + comments_recent + daily_recent
        last_active_at = last_active_map.get(user.id)

        data.append({
            "id": str(user.id),
            "display_name": user.display_name,
            "avatar_url": resolve_avatar_url(user.avatar_url),
            "member_color": resolve_member_color(user.id, user.preferences),
            "role": user.role,
            "is_active": user.is_active,
            "projects": user_memberships.get(user.id, []),
            "activity": {
                "window_days": window_days,
                "total": activity_total,
                "last_active_at": last_active_at.isoformat() if last_active_at else None,
                "research_notes": notes_total,
                "shared_posts": shared_total,
                "comments": comments_total,
                "daily_logs": daily_total,
                "recent": {
                    "total": activity_recent_total,
                    "research_notes": notes_recent,
                    "shared_posts": shared_recent,
                    "comments": comments_recent,
                    "daily_logs": daily_recent,
                },
            },
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
