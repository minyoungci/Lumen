from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


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
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserPublicOut(BaseModel):
    id: UUID
    display_name: str
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    role: str
    is_active: bool
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
    stats: UserStats
    created_at: Optional[datetime] = None


class UserUpdateMe(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None


class UserAdminUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
