from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ResearchNoteCreate(BaseModel):
    title: str = "Untitled Note"
    content: Dict[str, Any] = Field(default_factory=dict)
    cover_image_url: Optional[str] = None
    is_shared: bool = False
    is_pinned: bool = False
    word_count: int = 0
    reading_time: int = 0
    due_date: Optional[datetime] = None


class ResearchNoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[Dict[str, Any]] = None
    cover_image_url: Optional[str] = None
    is_shared: Optional[bool] = None
    is_pinned: Optional[bool] = None
    word_count: Optional[int] = None
    reading_time: Optional[int] = None
    due_date: Optional[datetime] = None


class ResearchNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    title: str
    content: Dict[str, Any]
    cover_image_url: Optional[str] = None
    is_shared: bool
    is_pinned: bool
    word_count: int
    reading_time: int
    due_date: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ResearchNoteListItem(BaseModel):
    id: UUID
    title: str
    preview: str
    is_shared: bool
    is_pinned: bool
    word_count: int
    reading_time: int
    updated_at: Optional[datetime] = None
