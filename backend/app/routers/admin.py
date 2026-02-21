from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, require_admin
from app.models.comment import Comment
from app.models.research_note import ResearchNote
from app.models.shared_post import SharedPost
from app.models.tag import Tag
from app.models.upload import Upload
from app.models.user import UserProfile

router = APIRouter()


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
                    "avatar_url": user.avatar_url,
                },
                "storage_used_bytes": int(total_size),
                "files_count": int(files_count),
                "breakdown": breakdown,
            }
        )

    return {"data": data}
