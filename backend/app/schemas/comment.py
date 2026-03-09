from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class CommentAuthor(BaseModel):
    id: UUID
    display_name: str
    avatar_url: Optional[str] = None
    member_color: Optional[str] = None
    status_message: Optional[str] = None
    pronouns: Optional[str] = None


class CommentCreate(BaseModel):
    content_type: str
    content_id: UUID
    parent_id: Optional[UUID] = None
    body: Dict[str, Any]


class CommentUpdate(BaseModel):
    body: Dict[str, Any]


class CommentReactionToggle(BaseModel):
    emoji: str


class CommentReactionSummary(BaseModel):
    emoji: str
    count: int
    reacted: bool = False


class CommentOut(BaseModel):
    id: UUID
    author: CommentAuthor
    body: Dict[str, Any]
    parent_id: Optional[UUID] = None
    is_edited: bool
    reactions: List[CommentReactionSummary] = Field(default_factory=list)
    reactions_total: int = 0
    replies: List["CommentOut"] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


CommentOut.model_rebuild()
