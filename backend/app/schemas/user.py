from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class UserStats(BaseModel):
    notes_count: int = 0
    posts_count: int = 0
    comments_count: int = 0
    bookmarks_count: int = 0


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    display_name: str
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    role: str
    is_active: bool
    storage_used: int
    member_color: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserPublicOut(BaseModel):
    id: UUID
    display_name: str
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    role: str
    is_active: bool
    member_color: str
    stats: UserStats


class UserMeOut(BaseModel):
    id: UUID
    email: Optional[str] = None
    display_name: str
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    role: str
    is_active: bool
    storage_used: int
    member_color: str
    preferences: Dict[str, Any] = Field(default_factory=dict)
    cache_bust_version: Optional[str] = None
    stats: UserStats
    created_at: Optional[datetime] = None


class UserUpdateMe(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    preferences: Optional[Dict[str, Any]] = None


class UserAdminUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
