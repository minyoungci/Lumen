from __future__ import annotations

from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user
from app.models.daily_log import DailyLog
from app.schemas.daily_log import DailyLogListItem, DailyLogOut, DailyLogUpsert

router = APIRouter()



def _extract_preview(content: dict, max_len: int = 120) -> str:
    if not isinstance(content, dict):
        return ""

    text = content.get("text")
    if isinstance(text, str):
        return text[:max_len]

    blocks = content.get("blocks")
    if isinstance(blocks, list):
        joined = " ".join(str(b.get("text", "")) for b in blocks if isinstance(b, dict))
        return joined[:max_len]

    return str(content)[:max_len]


@router.get("", response_model=dict)
def list_daily_logs(
    from_date: Optional[date] = Query(default=None, alias="from"),
    to_date: Optional[date] = Query(default=None, alias="to"),
    limit: int = Query(default=30, ge=1, le=100),
    cursor: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    q = db.query(DailyLog).filter(DailyLog.user_id == current_user.id)

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
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    row = (
        db.query(DailyLog)
        .filter(DailyLog.user_id == current_user.id, DailyLog.log_date == log_date)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Daily log not found")

    return {"data": DailyLogOut.model_validate(row)}


@router.put("/{log_date}", response_model=dict)
def upsert_daily_log(
    log_date: date,
    payload: DailyLogUpsert,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    row = (
        db.query(DailyLog)
        .filter(DailyLog.user_id == current_user.id, DailyLog.log_date == log_date)
        .first()
    )

    if row is None:
        row = DailyLog(
            user_id=current_user.id,
            log_date=log_date,
            content=payload.content,
            word_count=payload.word_count,
            status=payload.status,
        )
    else:
        row.content = payload.content
        row.word_count = payload.word_count
        row.status = payload.status

    try:
        db.add(row)
        db.commit()
        db.refresh(row)
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
        db.delete(row)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")
    return {"message": "Deleted"}
