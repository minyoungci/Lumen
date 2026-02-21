from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class BookmarkCreate(BaseModel):
    content_type: str
    content_id: UUID


class BookmarkOut(BaseModel):
    id: UUID
    content_type: str
    content_id: UUID
    content: Optional[dict] = None
    created_at: Optional[datetime] = None
