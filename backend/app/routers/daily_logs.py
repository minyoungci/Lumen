from __future__ import annotations

from datetime import date
import re
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user
from app.models.daily_log import DailyLog
from app.models.project import Project
from app.schemas.daily_log import DailyLogListItem, DailyLogOut, DailyLogUpsert
from app.tasks.knowledge_index_task import queue_delete as queue_knowledge_delete
from app.tasks.knowledge_index_task import queue_upsert as queue_knowledge_upsert

router = APIRouter()


def _verify_project_access(db: Session, project_id: UUID, current_user: RequestUser) -> None:
    project_exists = db.query(Project.id).filter(Project.id == project_id).first()
    if not project_exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if current_user.role == "admin":
        return

    from app.models.project_member import ProjectMember

    member = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == current_user.id,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this project")



def _extract_preview(content: dict, max_len: int = 120) -> str:
    if not isinstance(content, dict):
        return ""

    def _clip(value: str) -> str:
        return value[:max_len]

    def _normalize(value: str) -> str:
        return re.sub(r"\s+", " ", value).strip()

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
        candidates.append(_normalize(text))

    blocks = content.get("blocks")
    if isinstance(blocks, list):
        joined = " ".join(str(b.get("text", "")) for b in blocks if isinstance(b, dict))
        if joined.strip():
            candidates.append(_normalize(joined))

    tiptap = content.get("tiptap")
    extracted = _extract_text_from_node(tiptap if tiptap is not None else content)
    if extracted:
        candidates.append(_normalize(extracted))

    if candidates:
        richest = max(candidates, key=len)
        return _clip(richest)

    return _clip(_normalize(str(content)))


@router.get("", response_model=dict)
def list_daily_logs(
    from_date: Optional[date] = Query(default=None, alias="from"),
    to_date: Optional[date] = Query(default=None, alias="to"),
    limit: int = Query(default=30, ge=1, le=100),
    cursor: Optional[date] = Query(default=None),
    project_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    q = db.query(DailyLog).filter(DailyLog.user_id == current_user.id)

    if project_id is not None:
        _verify_project_access(db, project_id, current_user)
        q = q.filter(DailyLog.project_id == project_id)
    else:
        q = q.filter(DailyLog.project_id.is_(None))

    if from_date:
        q = q.filter(DailyLog.log_date >= from_date)
    if to_date:
        q = q.filter(DailyLog.log_date <= to_date)
    if cursor:
        q = q.filter(DailyLog.log_date < cursor)

    rows = q.order_by(DailyLog.log_date.desc()).limit(limit + 1).all()

    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = rows[-1].log_date if has_more and rows else None

    data = [
        DailyLogListItem(
            id=row.id,
            log_date=row.log_date,
            title=(
                row.content.get("title")
                if isinstance(row.content, dict) and isinstance(row.content.get("title"), str)
                else None
            ),
            word_count=row.word_count,
            status=row.status,
            preview=_extract_preview(row.content),
            created_at=row.created_at,
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


@router.get("/{log_date}", response_model=dict)
def get_daily_log(
    log_date: date,
    project_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    q = db.query(DailyLog).filter(
        DailyLog.user_id == current_user.id,
        DailyLog.log_date == log_date,
    )
    if project_id is not None:
        _verify_project_access(db, project_id, current_user)
        q = q.filter(DailyLog.project_id == project_id)
    else:
        q = q.filter(DailyLog.project_id.is_(None))
    row = q.first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Daily log not found")

    return {"data": DailyLogOut.model_validate(row)}


@router.put("/{log_date}", response_model=dict)
def upsert_daily_log(
    log_date: date,
    payload: DailyLogUpsert,
    project_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    if project_id is not None:
        _verify_project_access(db, project_id, current_user)

    row = (
        db.query(DailyLog)
        .filter(
            DailyLog.user_id == current_user.id,
            DailyLog.log_date == log_date,
        )
        .first()
    )

    if row is None:
        row = DailyLog(
            user_id=current_user.id,
            log_date=log_date,
            project_id=project_id,
            content=payload.content,
            word_count=payload.word_count,
            status=payload.status,
        )
    else:
        # Keep one log per user/date and move it to the requested space when needed.
        if row.project_id != project_id:
            row.project_id = project_id
        row.content = payload.content
        row.word_count = payload.word_count
        row.status = payload.status

    try:
        db.add(row)
        db.commit()
        db.refresh(row)
        try:
            queue_knowledge_upsert("daily_log", row.id)
        except Exception:
            pass
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {"data": DailyLogOut.model_validate(row), "message": "Saved"}


@router.delete("/{log_id}", response_model=dict)
def delete_daily_log(
    log_id: UUID,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    row = (
        db.query(DailyLog)
        .filter(DailyLog.id == log_id, DailyLog.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Daily log not found")

    try:
        row_id = row.id
        db.delete(row)
        db.commit()
        try:
            queue_knowledge_delete("daily_log", row_id)
        except Exception:
            pass
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")
    return {"message": "Deleted"}
