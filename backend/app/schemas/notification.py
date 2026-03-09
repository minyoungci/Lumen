from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class NotificationActor(BaseModel):
    id: UUID
    display_name: str
    avatar_url: Optional[str] = None
    member_color: Optional[str] = None


class NotificationOut(BaseModel):
    id: UUID
    type: str
    title: str
    body: Optional[str] = None
    link: Optional[str] = None
    is_read: bool
    actor: Optional[NotificationActor] = None
    created_at: Optional[datetime] = None
