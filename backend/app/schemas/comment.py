from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class CommentAuthor(BaseModel):
    id: UUID
    display_name: str
    avatar_url: Optional[str] = None


class CommentCreate(BaseModel):
    content_type: str
    content_id: UUID
    parent_id: Optional[UUID] = None
    body: Dict[str, Any]


class CommentUpdate(BaseModel):
    body: Dict[str, Any]


class CommentOut(BaseModel):
    id: UUID
    author: CommentAuthor
    body: Dict[str, Any]
    parent_id: Optional[UUID] = None
    is_edited: bool
    replies: List["CommentOut"] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


CommentOut.model_rebuild()
