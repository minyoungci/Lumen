from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ScheduleEventAttendeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_id: UUID
    user_id: UUID
    status: str
    created_at: datetime
