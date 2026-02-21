from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DailyLogBase(BaseModel):
    content: Dict[str, Any] = Field(default_factory=dict)
    word_count: int = 0


class DailyLogUpsert(DailyLogBase):
    status: Literal["draft", "private", "shared"] = "draft"


class DailyLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    log_date: date
    content: Dict[str, Any]
    word_count: int
    status: str = "draft"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class DailyLogListItem(BaseModel):
    id: UUID
    log_date: date
    word_count: int
    status: str = "draft"
    preview: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
