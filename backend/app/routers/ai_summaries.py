from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, require_admin
from app.models.ai_summary import AiSummary
from app.schemas.ai_summary import AiSummaryOut

router = APIRouter()


class GenerateSummaryRequest(BaseModel):
    user_id: UUID
    summary_date: Optional[datetime] = None
    period: str = "daily"


@router.get("/ai-summaries", response_model=dict)
def list_ai_summaries(
    user_id: Optional[UUID] = Query(default=None),
    period: Optional[str] = Query(default=None),
    limit: int = Query(default=30, ge=1, le=100),
    db: Session = Depends(get_db),
    _: RequestUser = Depends(require_admin),
):
    q = db.query(AiSummary)
    if user_id:
        q = q.filter(AiSummary.user_id == user_id)
    if period:
        q = q.filter(AiSummary.period == period)

    rows = q.order_by(AiSummary.summary_date.desc()).limit(limit).all()

    data = [
        AiSummaryOut(
            id=r.id,
            user_id=r.user_id,
            summary_date=r.summary_date,
            period=r.period,
            summary_text=r.summary_text,
            key_topics=r.key_topics or [],
            activity_score=r.activity_score,
            model_used=r.model_used,
            token_count=r.token_count,
            created_at=r.created_at,
        )
        for r in rows
    ]

    return {"data": data}


@router.post("/ai-summaries/generate", response_model=dict, status_code=status.HTTP_201_CREATED)
def generate_ai_summary(
    payload: GenerateSummaryRequest,
    db: Session = Depends(get_db),
    _: RequestUser = Depends(require_admin),
):
    # TODO: Integrate Anthropic + Celery background task for real summarization.
    row = AiSummary(
        user_id=payload.user_id,
        summary_date=payload.summary_date or datetime.utcnow(),
        period=payload.period,
        summary_text="AI summary generation is queued (stub).",
        key_topics=["pending"],
        activity_score=None,
        model_used="claude-sonnet-stub",
        token_count=0,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "data": AiSummaryOut(
            id=row.id,
            user_id=row.user_id,
            summary_date=row.summary_date,
            period=row.period,
            summary_text=row.summary_text,
            key_topics=row.key_topics or [],
            activity_score=row.activity_score,
            model_used=row.model_used,
            token_count=row.token_count,
            created_at=row.created_at,
        ),
        "message": "Generation queued",
    }
