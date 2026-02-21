from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ScheduleUser(BaseModel):
    id: UUID
    display_name: str
    avatar_url: Optional[str] = None


class ScheduleAttendeeOut(ScheduleUser):
    status: str = "invited"


class ScheduleEventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    is_all_day: bool = False
    location: Optional[str] = None
    color: Optional[str] = "blue"
    attendee_ids: List[UUID] = Field(default_factory=list)
    tag_ids: List[UUID] = Field(default_factory=list)


class ScheduleEventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    is_all_day: Optional[bool] = None
    location: Optional[str] = None
    color: Optional[str] = None
    attendee_ids: Optional[List[UUID]] = None
    tag_ids: Optional[List[UUID]] = None


class ScheduleRSVPUpdate(BaseModel):
    status: Literal["invited", "accepted", "declined", "tentative"]


class ScheduleEventOut(BaseModel):
    id: UUID
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    is_all_day: bool
    location: Optional[str] = None
    color: Optional[str] = None
    creator: ScheduleUser
    attendees: List[ScheduleAttendeeOut] = Field(default_factory=list)
    tags: List[dict] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
