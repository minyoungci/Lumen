from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class KanbanColumnCreate(BaseModel):
    name: str
    color: Optional[str] = "slate"


class KanbanColumnUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None


class KanbanColumnOut(BaseModel):
    id: UUID
    name: str
    color: Optional[str] = None
    sort_order: int
    cards_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
