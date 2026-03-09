from __future__ import annotations

import copy
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user
from app.models.project import Project
from app.models.shared_post import SharedPost
from app.models.user import UserProfile
from app.schemas.shared_post import (
    SharedPostCreate,
    SharedPostListItem,
    SharedPostOut,
    SharedPostUpdate,
)
from app.services.storage_service import storage_service
from app.tasks.knowledge_index_task import queue_delete as queue_knowledge_delete
from app.tasks.knowledge_index_task import queue_upsert as queue_knowledge_upsert
from app.utils.profile import resolve_avatar_url, resolve_member_color

router = APIRouter()
MISSING_UPLOAD_PLACEHOLDER = "/missing-upload.svg"


def _profile_pref_text(preferences: object, key: str) -> Optional[str]:
    if not isinstance(preferences, dict):
        return None
    value = preferences.get(key)
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None


def _is_project_member(db: Session, project_id: UUID, user_id: UUID) -> bool:
    from app.models.project_member import ProjectMember

    return (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
        .first()
        is not None
    )


def _verify_project_access(
    db: Session,
    project_id: Optional[UUID],
    current_user: RequestUser,
) -> None:
    if project_id is None:
        return

    project_exists = db.query(Project.id).filter(Project.id == project_id).first()
    if not project_exists:
        raise HTTPException(status_code=404, detail="Project not found")

    if current_user.role == "admin":
        return
    if not _is_project_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member of this project")



def _resolve_media_url(src: Any) -> Any:
    if not isinstance(src, str):
        return src
    cleaned = src.strip()
    if not cleaned:
        return src

    resolved = storage_service.resolve_public_url(cleaned)
    if resolved:
        return resolved
    if cleaned.startswith("/uploads/files/"):
        return MISSING_UPLOAD_PLACEHOLDER
    return src


def _canonicalize_media_src(src: Any) -> Any:
    if not isinstance(src, str):
        return src
    cleaned = src.strip()
    if not cleaned:
        return src
    canonical = storage_service.canonicalize_upload_url(cleaned)
    return canonical or cleaned


def _canonicalize_content_media(content: Any) -> Any:
    if not isinstance(content, dict):
        return content

    normalized = copy.deepcopy(content)

    def _walk(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("type") == "image":
                attrs = node.get("attrs")
                if isinstance(attrs, dict):
                    attrs["src"] = _canonicalize_media_src(attrs.get("src"))
            for value in node.values():
                _walk(value)
            return
        if isinstance(node, list):
            for item in node:
                _walk(item)

    _walk(normalized)
    return normalized


def _canonicalize_cover_image_url(url: Optional[str]) -> Optional[str]:
    if not isinstance(url, str):
        return None
    cleaned = url.strip()
    if not cleaned:
        return None
    canonical = storage_service.canonicalize_upload_url(cleaned)
    return canonical or cleaned


def _hydrate_content_media(content: Any) -> Any:
    if not isinstance(content, dict):
        return content

    hydrated = copy.deepcopy(content)

    def _walk(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("type") == "image":
                attrs = node.get("attrs")
                if isinstance(attrs, dict):
                    attrs["src"] = _resolve_media_url(attrs.get("src"))
            for value in node.values():
                _walk(value)
            return
        if isinstance(node, list):
            for item in node:
                _walk(item)

    _walk(hydrated)
    return hydrated


def _resolve_cover_image_url(url: Optional[str]) -> Optional[str]:
    if not isinstance(url, str):
        return None
    resolved = storage_service.resolve_public_url(url)
    if resolved:
        return resolved
    if url.startswith("/uploads/files/"):
        return MISSING_UPLOAD_PLACEHOLDER
    return url


def _shared_post_payload(db: Session, row: SharedPost) -> dict:
    payload = SharedPostOut.model_validate(row).model_dump()
    payload["content"] = _hydrate_content_media(payload.get("content"))
    cover = payload.get("cover_image_url") or _extract_cover_image_url(payload.get("content"))
    payload["cover_image_url"] = _resolve_cover_image_url(cover)
    author = db.query(UserProfile).filter(UserProfile.id == row.user_id).first()
    payload["author_name"] = author.display_name if author else None
    payload["author_avatar_url"] = resolve_avatar_url(author.avatar_url) if author else None
    payload["author_member_color"] = (
        resolve_member_color(author.id, author.preferences) if author else None
    )
    payload["author_status_message"] = (
        _profile_pref_text(author.preferences, "status_message") if author else None
    )
    payload["author_pronouns"] = (
        _profile_pref_text(author.preferences, "pronouns") if author else None
    )
    return payload


def _extract_preview(content: dict, max_len: Optional[int] = 140) -> str:
    if not isinstance(content, dict):
        return ""

    def _clip(value: str) -> str:
        return value if max_len is None else value[:max_len]

    def _extract_text_from_node(node: Any) -> str:
        if isinstance(node, dict):
            node_type = node.get("type")
            if node_type == "text":
                text_value = node.get("text")
                return text_value if isinstance(text_value, str) else ""

            chunks: list[str] = []
            for key in ("content", "tiptap", "blocks"):
                child = node.get(key)
                if child is not None:
                    chunks.append(_extract_text_from_node(child))

            # Fallback scan for unknown shapes.
            if not chunks:
                for value in node.values():
                    chunks.append(_extract_text_from_node(value))

            return " ".join(part for part in chunks if part).strip()

        if isinstance(node, list):
            parts = [_extract_text_from_node(item) for item in node]
            return " ".join(part for part in parts if part).strip()

        if isinstance(node, str):
            return node

        return ""

    candidates: list[str] = []

    text = content.get("text")
    if isinstance(text, str) and text.strip():
        candidates.append(text.strip())

    blocks = content.get("blocks")
    if isinstance(blocks, list):
        joined = " ".join(str(b.get("text", "")) for b in blocks if isinstance(b, dict))
        if joined.strip():
            candidates.append(joined.strip())

    tiptap = content.get("tiptap")
    extracted = _extract_text_from_node(tiptap if tiptap is not None else content)
    if extracted:
        candidates.append(extracted)

    if candidates:
        # Legacy rows can have truncated `content.text` while tiptap/blocks holds richer text.
        # Use the richest extracted candidate so old posts render with full content in feed.
        richest = max(candidates, key=len)
        return _clip(richest)

    serialized = str(content)
    return _clip(serialized)


def _extract_first_image_from_node(node: Any) -> Optional[str]:
    if isinstance(node, dict):
        if node.get("type") == "image":
            attrs = node.get("attrs")
            if isinstance(attrs, dict):
                src = attrs.get("src")
                if isinstance(src, str) and src.strip():
                    return src.strip()

        for key in ("content", "tiptap", "blocks"):
            child = node.get(key)
            found = _extract_first_image_from_node(child)
            if found:
                return found

        for value in node.values():
            found = _extract_first_image_from_node(value)
            if found:
                return found
        return None

    if isinstance(node, list):
        for item in node:
            found = _extract_first_image_from_node(item)
            if found:
                return found
        return None

    return None


def _extract_cover_image_url(content: Any) -> Optional[str]:
    return _extract_first_image_from_node(content)


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
        _verify_project_access(db, project_id, current_user)
        q = q.filter(SharedPost.project_id == project_id)
        if current_user.role != "admin":
            q = q.filter(
                or_(
                    SharedPost.visibility == "shared",
                    SharedPost.user_id == current_user.id,
                )
            )
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
        author_map = {
            p.id: {
                "display_name": p.display_name,
                "avatar_url": resolve_avatar_url(p.avatar_url),
                "member_color": resolve_member_color(p.id, p.preferences),
                "status_message": _profile_pref_text(p.preferences, "status_message"),
                "pronouns": _profile_pref_text(p.preferences, "pronouns"),
            }
            for p in profiles
        }
    else:
        author_map = {}

    data = [
        SharedPostListItem(
            id=row.id,
            user_id=row.user_id,
            type=row.type,
            title=row.title,
            preview=_extract_preview(
                row.content,
                max_len=None if row.type in {"kanban", "insight"} else 140,
            ),
            cover_image_url=_resolve_cover_image_url(
                row.cover_image_url or _extract_cover_image_url(row.content)
            ),
            kanban_column=row.kanban_column,
            kanban_order=row.kanban_order,
            is_pinned=row.is_pinned,
            view_count=row.view_count,
            author_name=author_map.get(row.user_id, {}).get("display_name"),
            author_avatar_url=author_map.get(row.user_id, {}).get("avatar_url"),
            author_member_color=author_map.get(row.user_id, {}).get("member_color"),
            author_status_message=author_map.get(row.user_id, {}).get("status_message"),
            author_pronouns=author_map.get(row.user_id, {}).get("pronouns"),
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
    current_user: RequestUser = Depends(get_current_user),
):
    row = (
        db.query(SharedPost)
        .filter(SharedPost.id == post_id, SharedPost.deleted_at.is_(None))
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared post not found")

    _verify_project_access(db, row.project_id, current_user)
    if row.visibility == "private" and row.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    row.view_count = (row.view_count or 0) + 1
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
        try:
            queue_knowledge_upsert("shared_post", row.id)
        except Exception:
            pass
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {"data": _shared_post_payload(db, row)}


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_shared_post(
    payload: SharedPostCreate,
    project_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    _verify_project_access(db, project_id, current_user)

    payload_data = payload.model_dump()
    payload_data["content"] = _canonicalize_content_media(payload_data.get("content"))
    if not payload_data.get("cover_image_url"):
        payload_data["cover_image_url"] = _extract_cover_image_url(payload_data.get("content"))
    payload_data["cover_image_url"] = _canonicalize_cover_image_url(payload_data.get("cover_image_url"))

    row = SharedPost(user_id=current_user.id, project_id=project_id, **payload_data)
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
        try:
            queue_knowledge_upsert("shared_post", row.id)
        except Exception:
            pass
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {"data": _shared_post_payload(db, row), "message": "Created"}


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
    _verify_project_access(db, row.project_id, current_user)
    if row.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only author/admin can update")

    ALLOWED_POST_FIELDS = {
        "title",
        "content",
        "type",
        "is_pinned",
        "kanban_column",
        "kanban_order",
        "visibility",
        "cover_image_url",
    }
    updates = {
        k: v for k, v in payload.model_dump(exclude_unset=True).items()
        if k in ALLOWED_POST_FIELDS
    }
    if "content" in updates:
        updates["content"] = _canonicalize_content_media(updates.get("content"))
        updates["cover_image_url"] = _extract_cover_image_url(updates.get("content"))
    elif updates.get("cover_image_url") == "":
        updates["cover_image_url"] = None
    elif "cover_image_url" in updates:
        updates["cover_image_url"] = _canonicalize_cover_image_url(updates.get("cover_image_url"))

    for key, value in updates.items():
        setattr(row, key, value)

    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {"data": _shared_post_payload(db, row), "message": "Updated"}


@router.delete("/{post_id}", response_model=dict)
def delete_shared_post(
    post_id: UUID,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    row = db.query(SharedPost).filter(SharedPost.id == post_id).first()
    if not row or row.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared post not found")
    _verify_project_access(db, row.project_id, current_user)
    if row.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only author/admin can delete")

    from datetime import datetime

    row.deleted_at = datetime.utcnow()
    try:
        db.add(row)
        db.commit()
        try:
            queue_knowledge_delete("shared_post", row.id)
        except Exception:
            pass
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {"message": "Deleted"}
