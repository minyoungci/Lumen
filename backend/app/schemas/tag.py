from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class TagAuthor(BaseModel):
    id: UUID
    display_name: str


class TagCreate(BaseModel):
    name: str
    color: str = "blue"
    description: Optional[str] = None


class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None


class TagOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    color: str
    description: Optional[str] = None
    usage_count: int = 0
    created_by: Optional[TagAuthor] = None
    created_at: Optional[datetime] = None
