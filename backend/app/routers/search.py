from __future__ import annotations

from datetime import date
from typing import Dict, List, Optional, Set
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, cast
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user
from app.models.content_tag import ContentTag
from app.models.daily_log import DailyLog
from app.models.research_note import ResearchNote
from app.models.shared_post import SharedPost
from app.models.tag import Tag
from app.models.user import UserProfile

router = APIRouter()



def _extract_preview(raw, max_len: int = 180) -> str:
    if isinstance(raw, str):
        return raw[:max_len]
    if isinstance(raw, dict):
        text = raw.get("text")
        if isinstance(text, str):
            return text[:max_len]
        blocks = raw.get("blocks")
        if isinstance(blocks, list):
            joined = " ".join(str(b.get("text", "")) for b in blocks if isinstance(b, dict))
            return joined[:max_len]
        return str(raw)[:max_len]
    return str(raw)[:max_len]



def _authors_map(db: Session, user_ids: Set[UUID]) -> Dict[UUID, dict]:
    if not user_ids:
        return {}

    rows = db.query(UserProfile).filter(UserProfile.id.in_(list(user_ids))).all()
    return {
        r.id: {
            "id": r.id,
            "display_name": r.display_name,
            "avatar_url": r.avatar_url,
        }
        for r in rows
    }


@router.get("", response_model=dict)
def global_search(
    q: str = Query(..., min_length=1),
    content_type: Optional[str] = Query(default=None),
    tag: Optional[str] = Query(default=None),
    author: Optional[UUID] = Query(default=None),
    from_date: Optional[date] = Query(default=None, alias="from"),
    to_date: Optional[date] = Query(default=None, alias="to"),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    query_text = f"%{q}%"

    allowed_types = {"research_note", "shared_post", "tag", "daily_log"}
    target_types = allowed_types
    if content_type:
        target_types = {t.strip() for t in content_type.split(",") if t.strip()}
        unknown = target_types - allowed_types
        if unknown:
            raise HTTPException(status_code=400, detail=f"Invalid content_type: {', '.join(sorted(unknown))}")

    tagged_notes: Optional[Set[UUID]] = None
    tagged_posts: Optional[Set[UUID]] = None
    if tag:
        tag_row = db.query(Tag).filter(Tag.slug == tag).first()
        if not tag_row:
            return {
                "data": [],
                "pagination": {"has_more": False, "next_cursor": None, "total": 0},
                "total_results": 0,
            }

        rows = db.query(ContentTag).filter(ContentTag.tag_id == tag_row.id).all()
        tagged_notes = {r.content_id for r in rows if r.content_type == "research_note"}
        tagged_posts = {r.content_id for r in rows if r.content_type == "shared_post"}

    results: List[dict] = []
    collected_user_ids: Set[UUID] = set()

    if "research_note" in target_types:
        q_notes = db.query(ResearchNote).filter(
            ResearchNote.deleted_at.is_(None),
            (ResearchNote.title.ilike(query_text)) | (cast(ResearchNote.content, String).ilike(query_text)),
        )

        q_notes = q_notes.filter((ResearchNote.user_id == current_user.id) | (ResearchNote.is_shared.is_(True)))

        if author:
            q_notes = q_notes.filter(ResearchNote.user_id == author)
        if from_date:
            q_notes = q_notes.filter(ResearchNote.updated_at >= from_date)
        if to_date:
            q_notes = q_notes.filter(ResearchNote.updated_at <= to_date)
        if tagged_notes is not None:
            if tagged_notes:
                q_notes = q_notes.filter(ResearchNote.id.in_(list(tagged_notes)))
            else:
                q_notes = q_notes.filter(False)

        for row in q_notes.order_by(ResearchNote.updated_at.desc()).limit(200).all():
            collected_user_ids.add(row.user_id)
            results.append(
                {
                    "id": row.id,
                    "content_type": "research_note",
                    "title": row.title,
                    "preview": _extract_preview(row.content),
                    "author_id": row.user_id,
                    "tags": [],
                    "matched_field": "title/content",
                    "updated_at": row.updated_at,
                }
            )

    if "shared_post" in target_types:
        q_posts = db.query(SharedPost).filter(
            SharedPost.deleted_at.is_(None),
            (SharedPost.title.ilike(query_text)) | (cast(SharedPost.content, String).ilike(query_text)),
        )

        if author:
            q_posts = q_posts.filter(SharedPost.user_id == author)
        if from_date:
            q_posts = q_posts.filter(SharedPost.updated_at >= from_date)
        if to_date:
            q_posts = q_posts.filter(SharedPost.updated_at <= to_date)
        if tagged_posts is not None:
            if tagged_posts:
                q_posts = q_posts.filter(SharedPost.id.in_(list(tagged_posts)))
            else:
                q_posts = q_posts.filter(False)

        for row in q_posts.order_by(SharedPost.updated_at.desc()).limit(200).all():
            collected_user_ids.add(row.user_id)
            results.append(
                {
                    "id": row.id,
                    "content_type": "shared_post",
                    "title": row.title,
                    "preview": _extract_preview(row.content),
                    "author_id": row.user_id,
                    "tags": [],
                    "matched_field": "title/content",
                    "updated_at": row.updated_at,
                }
            )

    if "tag" in target_types:
        q_tags = db.query(Tag).filter((Tag.name.ilike(query_text)) | (Tag.description.ilike(query_text)))
        for row in q_tags.order_by(Tag.name.asc()).limit(100).all():
            results.append(
                {
                    "id": row.id,
                    "content_type": "tag",
                    "title": row.name,
                    "preview": row.description or "",
                    "author_id": row.created_by,
                    "tags": [],
                    "matched_field": "name/description",
                    "updated_at": row.created_at,
                }
            )
            if row.created_by:
                collected_user_ids.add(row.created_by)

    if "daily_log" in target_types:
        q_logs = db.query(DailyLog).filter(
            DailyLog.user_id == current_user.id,
            cast(DailyLog.content, String).ilike(query_text),
        )
        if from_date:
            q_logs = q_logs.filter(DailyLog.log_date >= from_date)
        if to_date:
            q_logs = q_logs.filter(DailyLog.log_date <= to_date)

        for row in q_logs.order_by(DailyLog.log_date.desc()).limit(100).all():
            results.append(
                {
                    "id": row.id,
                    "content_type": "daily_log",
                    "title": f"Daily Log {row.log_date.isoformat()}",
                    "preview": _extract_preview(row.content),
                    "author_id": row.user_id,
                    "tags": [],
                    "matched_field": "content",
                    "updated_at": row.updated_at,
                }
            )
            collected_user_ids.add(row.user_id)

    # attach tag names for notes/posts
    content_keys = {
        (r["content_type"], r["id"])
        for r in results
        if r["content_type"] in {"research_note", "shared_post"}
    }
    tags_by_content: Dict[tuple, List[dict]] = {k: [] for k in content_keys}

    if content_keys:
        content_rows = db.query(ContentTag).filter(ContentTag.content_type.in_(["research_note", "shared_post"]))
        content_rows = content_rows.all()
        tag_ids = {r.tag_id for r in content_rows}
        tag_map = {t.id: t for t in db.query(Tag).filter(Tag.id.in_(list(tag_ids))).all()} if tag_ids else {}

        for row in content_rows:
            key = (row.content_type, row.content_id)
            if key in tags_by_content and row.tag_id in tag_map:
                t = tag_map[row.tag_id]
                tags_by_content[key].append({"id": t.id, "name": t.name, "slug": t.slug, "color": t.color})

    authors = _authors_map(db, collected_user_ids)

    normalized = []
    for row in results:
        key = (row["content_type"], row["id"])
        normalized.append(
            {
                "id": row["id"],
                "content_type": row["content_type"],
                "title": row["title"],
                "preview": row["preview"],
                "author": authors.get(row["author_id"]),
                "tags": tags_by_content.get(key, []),
                "matched_field": row["matched_field"],
                "updated_at": row["updated_at"],
            }
        )

    def _sort_key(item: dict) -> float:
        dt = item.get("updated_at")
        return dt.timestamp() if dt else 0.0

    normalized.sort(key=_sort_key, reverse=True)

    offset = 0
    if cursor:
        try:
            offset = max(0, int(cursor))
        except ValueError:
            offset = 0

    total_results = len(normalized)
    paged = normalized[offset : offset + limit]
    next_cursor = str(offset + limit) if (offset + limit) < total_results else None

    return {
        "data": paged,
        "pagination": {
            "has_more": next_cursor is not None,
            "next_cursor": next_cursor,
            "total": len(paged),
        },
        "total_results": total_results,
    }
