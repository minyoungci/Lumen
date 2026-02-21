from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PostReadStatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    post_id: UUID
    user_id: UUID
    read_at: datetime
