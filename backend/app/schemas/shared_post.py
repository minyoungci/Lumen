from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SharedPostCreate(BaseModel):
    type: str = "article"
    title: str
    content: Dict[str, Any] = Field(default_factory=dict)
    cover_image_url: Optional[str] = None
    kanban_column: Optional[str] = None
    kanban_order: Optional[int] = None
    is_pinned: bool = False
    word_count: int = 0
    reading_time: int = 0
    visibility: Literal["shared", "private"] = "shared"


class SharedPostUpdate(BaseModel):
    type: Optional[str] = None
    title: Optional[str] = None
    content: Optional[Dict[str, Any]] = None
    cover_image_url: Optional[str] = None
    kanban_column: Optional[str] = None
    kanban_order: Optional[int] = None
    is_pinned: Optional[bool] = None
    word_count: Optional[int] = None
    reading_time: Optional[int] = None
    visibility: Optional[Literal["shared", "private"]] = None


class SharedPostOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    type: str
    title: str
    content: Dict[str, Any]
    cover_image_url: Optional[str] = None
    kanban_column: Optional[str] = None
    kanban_order: Optional[int] = None
    is_pinned: bool
    visibility: str = "shared"
    word_count: int
    reading_time: int
    view_count: int
    author_name: Optional[str] = None
    author_avatar_url: Optional[str] = None
    author_member_color: Optional[str] = None
    author_status_message: Optional[str] = None
    author_pronouns: Optional[str] = None
    deleted_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class SharedPostListItem(BaseModel):
    id: UUID
    user_id: UUID
    type: str
    title: str
    preview: str
    cover_image_url: Optional[str] = None
    kanban_column: Optional[str] = None
    kanban_order: Optional[int] = None
    is_pinned: bool
    view_count: int
    author_name: Optional[str] = None
    author_avatar_url: Optional[str] = None
    author_member_color: Optional[str] = None
    author_status_message: Optional[str] = None
    author_pronouns: Optional[str] = None
    created_at: Optional[datetime] = None
    visibility: str = "shared"
    updated_at: Optional[datetime] = None
