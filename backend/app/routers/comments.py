from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional, Set
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user
from app.models.comment import Comment
from app.models.comment_reaction import CommentReaction
from app.models.notification import Notification
from app.models.project_member import ProjectMember
from app.models.research_note import ResearchNote
from app.models.schedule import ScheduleEvent
from app.models.shared_post import SharedPost
from app.models.user import UserProfile
from app.schemas.comment import (
    CommentAuthor,
    CommentCreate,
    CommentOut,
    CommentReactionSummary,
    CommentReactionToggle,
    CommentUpdate,
)
from app.utils.profile import is_notification_enabled, resolve_avatar_url, resolve_member_color

router = APIRouter()

ALLOWED_REACTION_EMOJIS = {"👍", "❤️", "🔥", "👏", "👀", "🎉"}


def _profile_pref_text(preferences: object, key: str) -> Optional[str]:
    if not isinstance(preferences, dict):
        return None
    value = preferences.get(key)
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None


def _is_project_member(db: Session, project_id: UUID, user_id: UUID) -> bool:
    return (
        db.query(ProjectMember.id)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
        .first()
        is not None
    )


def _can_access_project_scope(
    db: Session,
    project_id: Optional[UUID],
    current_user: RequestUser,
) -> bool:
    if project_id is None:
        return True
    if current_user.role == "admin":
        return True
    return _is_project_member(db, project_id, current_user.id)


def _ensure_content_access(
    db: Session,
    content_type: str,
    content_id: UUID,
    current_user: RequestUser,
) -> tuple[Optional[UUID], Optional[UUID], str]:
    if content_type == "shared_post":
        row = (
            db.query(SharedPost)
            .filter(SharedPost.id == content_id, SharedPost.deleted_at.is_(None))
            .first()
        )
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Content not found")
        if not _can_access_project_scope(db, row.project_id, current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        if row.visibility == "private" and row.user_id != current_user.id and current_user.role != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        link = (
            f"/shared/feed/{content_id}"
            if getattr(row, "type", "") in {"kanban", "insight"}
            else f"/shared/articles/{content_id}"
        )
        return row.project_id, row.user_id, link

    if content_type == "research_note":
        row = (
            db.query(ResearchNote)
            .filter(ResearchNote.id == content_id, ResearchNote.deleted_at.is_(None))
            .first()
        )
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Content not found")
        if not _can_access_project_scope(db, row.project_id, current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        if not row.is_shared and row.user_id != current_user.id and current_user.role != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        return row.project_id, row.user_id, f"/research-notes/{content_id}"

    if content_type == "schedule_event":
        row = db.query(ScheduleEvent).filter(ScheduleEvent.id == content_id).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Content not found")
        if not _can_access_project_scope(db, row.project_id, current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        return row.project_id, row.created_by, "/schedule"

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported content_type")


def _author_map(db: Session, user_ids: List[UUID]) -> Dict[UUID, CommentAuthor]:
    if not user_ids:
        return {}

    rows = db.query(UserProfile).filter(UserProfile.id.in_(list(set(user_ids)))).all()
    return {
        r.id: CommentAuthor(
            id=r.id,
            display_name=r.display_name,
            avatar_url=resolve_avatar_url(r.avatar_url),
            member_color=resolve_member_color(r.id, r.preferences),
            status_message=_profile_pref_text(r.preferences, "status_message"),
            pronouns=_profile_pref_text(r.preferences, "pronouns"),
        )
        for r in rows
    }


def _comment_preview(body: dict) -> str:
    if not isinstance(body, dict):
        return ""
    text = body.get("text")
    if isinstance(text, str):
        return text.strip()[:120]
    return str(body)[:120]


def _resolve_comment_link(db: Session, content_type: str, content_id: UUID) -> str:
    if content_type == "shared_post":
        post = db.query(SharedPost).filter(SharedPost.id == content_id).first()
        if post and getattr(post, "type", None) in {"kanban", "insight"}:
            return f"/shared/feed/{content_id}"
        return f"/shared/articles/{content_id}"
    if content_type == "research_note":
        return f"/research-notes/{content_id}"
    if content_type == "schedule_event":
        return "/schedule"
    return f"/{content_type}s/{content_id}"


def _resolve_content_owner(db: Session, content_type: str, content_id: UUID) -> Optional[UUID]:
    if content_type == "shared_post":
        row = db.query(SharedPost.user_id).filter(SharedPost.id == content_id).first()
        return row[0] if row else None
    if content_type == "research_note":
        row = db.query(ResearchNote.user_id).filter(ResearchNote.id == content_id).first()
        return row[0] if row else None
    return None


def _reaction_map(
    db: Session,
    comment_ids: List[UUID],
    current_user_id: UUID,
) -> tuple[Dict[UUID, List[CommentReactionSummary]], Dict[UUID, int]]:
    if not comment_ids:
        return {}, {}

    rows = (
        db.query(CommentReaction)
        .filter(CommentReaction.comment_id.in_(list(set(comment_ids))))
        .all()
    )

    by_comment: Dict[UUID, Dict[str, int]] = {}
    mine: Dict[UUID, Set[str]] = {}
    total: Dict[UUID, int] = {}
    for row in rows:
        by_comment.setdefault(row.comment_id, {})
        by_comment[row.comment_id][row.emoji] = by_comment[row.comment_id].get(row.emoji, 0) + 1
        total[row.comment_id] = total.get(row.comment_id, 0) + 1
        if row.user_id == current_user_id:
            mine.setdefault(row.comment_id, set()).add(row.emoji)

    summary_map: Dict[UUID, List[CommentReactionSummary]] = {}
    for comment_id, counts in by_comment.items():
        summary_map[comment_id] = [
            CommentReactionSummary(
                emoji=emoji,
                count=count,
                reacted=emoji in mine.get(comment_id, set()),
            )
            for emoji, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        ]

    return summary_map, total


def _to_comment_out(
    row: Comment,
    author: Optional[CommentAuthor],
    reactions: Optional[List[CommentReactionSummary]] = None,
    reactions_total: int = 0,
    replies: Optional[List[CommentOut]] = None,
) -> CommentOut:
    return CommentOut(
        id=row.id,
        author=author or CommentAuthor(id=row.user_id, display_name="Unknown"),
        body=row.body,
        parent_id=row.parent_id,
        is_edited=row.is_edited,
        reactions=reactions or [],
        reactions_total=reactions_total,
        replies=replies or [],
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _enqueue_notification(
    db: Session,
    recipient_id: Optional[UUID],
    actor_id: UUID,
    notif_type: str,
    title: str,
    body: Optional[str],
    link: Optional[str],
    preference_key: str,
) -> None:
    if not recipient_id or recipient_id == actor_id:
        return

    recipient = db.query(UserProfile).filter(UserProfile.id == recipient_id).first()
    if not recipient or not recipient.is_active:
        return
    if not is_notification_enabled(recipient.preferences, preference_key, default=True):
        return

    db.add(
        Notification(
            user_id=recipient_id,
            actor_id=actor_id,
            type=notif_type,
            title=title[:200],
            body=(body[:300] if isinstance(body, str) else None),
            link=link,
            is_read=False,
        )
    )


@router.get("", response_model=dict)
def list_comments(
    content_type: str = Query(...),
    content_id: UUID = Query(...),
    limit: int = Query(default=50, ge=1, le=100),
    cursor: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    _ensure_content_access(db, content_type, content_id, current_user)

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
    replies: List[Comment] = []
    if parent_ids:
        replies = (
            db.query(Comment)
            .filter(Comment.parent_id.in_(parent_ids), Comment.deleted_at.is_(None))
            .order_by(Comment.created_at.asc())
            .all()
        )

    all_user_ids = [p.user_id for p in parents] + [r.user_id for r in replies]
    authors = _author_map(db, all_user_ids)
    all_comment_ids = [p.id for p in parents] + [r.id for r in replies]
    reaction_summaries, reaction_totals = _reaction_map(db, all_comment_ids, current_user.id)

    replies_by_parent: Dict[UUID, List[CommentOut]] = {}
    for reply in replies:
        replies_by_parent.setdefault(reply.parent_id, []).append(
            _to_comment_out(
                reply,
                authors.get(reply.user_id),
                reactions=reaction_summaries.get(reply.id, []),
                reactions_total=reaction_totals.get(reply.id, 0),
            )
        )

    data = [
        _to_comment_out(
            parent,
            authors.get(parent.user_id),
            reactions=reaction_summaries.get(parent.id, []),
            reactions_total=reaction_totals.get(parent.id, 0),
            replies=replies_by_parent.get(parent.id, []),
        )
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


@router.get("/summary", response_model=dict)
def get_comments_summary(
    content_type: str = Query(...),
    content_ids: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    if content_type != "shared_post":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only shared_post is supported")

    raw_ids = [chunk.strip() for chunk in content_ids.split(",")]
    parsed_ids: List[UUID] = []
    seen: Set[UUID] = set()
    for chunk in raw_ids:
        if not chunk:
            continue
        try:
            content_id = UUID(chunk)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid content_id: {chunk}") from exc
        if content_id in seen:
            continue
        seen.add(content_id)
        parsed_ids.append(content_id)

    if not parsed_ids:
        return {"data": {}}
    if len(parsed_ids) > 100:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="content_ids can include up to 100 ids")

    posts = (
        db.query(SharedPost)
        .filter(
            SharedPost.id.in_(parsed_ids),
            SharedPost.deleted_at.is_(None),
        )
        .all()
    )

    accessible_ids: List[UUID] = []
    for row in posts:
        if not _can_access_project_scope(db, row.project_id, current_user):
            continue
        if row.visibility == "private" and row.user_id != current_user.id and current_user.role != "admin":
            continue
        accessible_ids.append(row.id)

    if not accessible_ids:
        return {"data": {}}

    totals_rows = (
        db.query(Comment.content_id, func.count(Comment.id))
        .filter(
            Comment.content_type == "shared_post",
            Comment.content_id.in_(accessible_ids),
            Comment.deleted_at.is_(None),
        )
        .group_by(Comment.content_id)
        .all()
    )
    totals_map: Dict[UUID, int] = {row[0]: int(row[1] or 0) for row in totals_rows}

    recent_rows = (
        db.query(Comment.content_id, Comment.user_id, Comment.created_at)
        .filter(
            Comment.content_type == "shared_post",
            Comment.content_id.in_(accessible_ids),
            Comment.deleted_at.is_(None),
        )
        .order_by(Comment.created_at.desc())
        .limit(1200)
        .all()
    )

    recent_user_ids_by_content: Dict[UUID, List[UUID]] = {content_id: [] for content_id in accessible_ids}
    seen_users_by_content: Dict[UUID, Set[UUID]] = {content_id: set() for content_id in accessible_ids}
    author_ids: Set[UUID] = set()
    for content_id, user_id, _ in recent_rows:
        if content_id not in recent_user_ids_by_content:
            continue
        if user_id in seen_users_by_content[content_id]:
            continue
        if len(recent_user_ids_by_content[content_id]) >= 3:
            continue
        seen_users_by_content[content_id].add(user_id)
        recent_user_ids_by_content[content_id].append(user_id)
        author_ids.add(user_id)

    authors = _author_map(db, list(author_ids))

    data: Dict[str, dict] = {}
    for content_id in accessible_ids:
        recent_authors = [
            authors[user_id].model_dump()
            for user_id in recent_user_ids_by_content.get(content_id, [])
            if user_id in authors
        ]
        data[str(content_id)] = {
            "total": int(totals_map.get(content_id, 0)),
            "recent_authors": recent_authors,
        }

    return {"data": data}


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_comment(
    payload: CommentCreate,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    _, content_owner_id, link = _ensure_content_access(
        db=db,
        content_type=payload.content_type,
        content_id=payload.content_id,
        current_user=current_user,
    )

    parent: Optional[Comment] = None
    if payload.parent_id:
        parent = db.query(Comment).filter(Comment.id == payload.parent_id, Comment.deleted_at.is_(None)).first()
        if not parent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent comment not found")
        if parent.content_type != payload.content_type or parent.content_id != payload.content_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Parent comment target mismatch")

    row = Comment(
        user_id=current_user.id,
        content_type=payload.content_type,
        content_id=payload.content_id,
        parent_id=payload.parent_id,
        body=payload.body,
    )

    author = db.query(UserProfile).filter(UserProfile.id == current_user.id).first()
    actor_name = author.display_name if author else "A teammate"
    preview = _comment_preview(payload.body)

    if parent and parent.user_id != current_user.id:
        _enqueue_notification(
            db,
            recipient_id=parent.user_id,
            actor_id=current_user.id,
            notif_type="comment_reply",
            title=f"{actor_name} replied to your comment",
            body=preview or "Your comment has a new reply.",
            link=link,
            preference_key="notify_replies",
        )
    else:
        if content_owner_id and content_owner_id != current_user.id:
            _enqueue_notification(
                db,
                recipient_id=content_owner_id,
                actor_id=current_user.id,
                notif_type="comment_on_post",
                title=f"{actor_name} left a comment",
                body=preview or "Your post has a new comment.",
                link=link,
                preference_key="notify_comments",
            )

    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {
        "data": _to_comment_out(
            row,
            CommentAuthor(
                id=current_user.id,
                display_name=author.display_name if author else "Unknown",
                avatar_url=resolve_avatar_url(author.avatar_url) if author else None,
                member_color=resolve_member_color(current_user.id, author.preferences if author else {}),
                status_message=_profile_pref_text(author.preferences, "status_message") if author else None,
                pronouns=_profile_pref_text(author.preferences, "pronouns") if author else None,
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
    _ensure_content_access(db, row.content_type, row.content_id, current_user)
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
                avatar_url=resolve_avatar_url(author.avatar_url) if author else None,
                member_color=resolve_member_color(current_user.id, author.preferences if author else {}),
                status_message=_profile_pref_text(author.preferences, "status_message") if author else None,
                pronouns=_profile_pref_text(author.preferences, "pronouns") if author else None,
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
    _ensure_content_access(db, row.content_type, row.content_id, current_user)
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


@router.get("/{comment_id}/reactions", response_model=dict)
def get_comment_reactions(
    comment_id: UUID,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    row = db.query(Comment).filter(Comment.id == comment_id, Comment.deleted_at.is_(None)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    _ensure_content_access(db, row.content_type, row.content_id, current_user)

    summary_map, total_map = _reaction_map(db, [comment_id], current_user.id)
    return {
        "data": {
            "comment_id": str(comment_id),
            "reactions": [item.model_dump() for item in summary_map.get(comment_id, [])],
            "reactions_total": int(total_map.get(comment_id, 0)),
        }
    }


@router.post("/{comment_id}/reactions", response_model=dict)
def toggle_comment_reaction(
    comment_id: UUID,
    payload: CommentReactionToggle,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    emoji = payload.emoji.strip()
    if emoji not in ALLOWED_REACTION_EMOJIS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported emoji. Allowed: {', '.join(sorted(ALLOWED_REACTION_EMOJIS))}",
        )

    comment = db.query(Comment).filter(Comment.id == comment_id, Comment.deleted_at.is_(None)).first()
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    _ensure_content_access(db, comment.content_type, comment.content_id, current_user)

    existing = (
        db.query(CommentReaction)
        .filter(CommentReaction.comment_id == comment_id, CommentReaction.user_id == current_user.id)
        .first()
    )

    toggled_off = False
    changed = False
    if existing and existing.emoji == emoji:
        db.delete(existing)
        toggled_off = True
    elif existing:
        existing.emoji = emoji
        db.add(existing)
        changed = True
    else:
        db.add(CommentReaction(comment_id=comment_id, user_id=current_user.id, emoji=emoji))
        changed = True

    actor = db.query(UserProfile).filter(UserProfile.id == current_user.id).first()
    actor_name = actor.display_name if actor else "A teammate"
    if changed and comment.user_id != current_user.id:
        _enqueue_notification(
            db,
            recipient_id=comment.user_id,
            actor_id=current_user.id,
            notif_type="comment_reaction",
            title=f"{actor_name} reacted to your comment",
            body=f"{emoji} {_comment_preview(comment.body)}".strip(),
            link=_resolve_comment_link(db, comment.content_type, comment.content_id),
            preference_key="notify_reactions",
        )

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    summary_map, total_map = _reaction_map(db, [comment_id], current_user.id)
    return {
        "data": {
            "comment_id": str(comment_id),
            "emoji": emoji,
            "toggled_off": toggled_off,
            "reactions": [item.model_dump() for item in summary_map.get(comment_id, [])],
            "reactions_total": int(total_map.get(comment_id, 0)),
        },
        "message": "Reaction updated",
    }
