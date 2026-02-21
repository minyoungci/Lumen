from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class MentionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    mentioned_user: UUID
    mentioned_by: UUID
    context_type: str
    context_id: UUID
    is_read: bool
    created_at: datetime
