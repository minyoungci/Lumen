from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class AiSummaryOut(BaseModel):
    id: UUID
    user_id: UUID
    summary_date: datetime
    period: str
    summary_text: str
    key_topics: List[str] = Field(default_factory=list)
    activity_score: Optional[int] = None
    model_used: str
    token_count: Optional[int] = None
    created_at: Optional[datetime] = None
