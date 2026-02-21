from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid

from app.database import Base

class ScheduleEventAttendee(Base):
    __tablename__ = "schedule_event_attendees"
    
    event_id = Column(UUID(as_uuid=True), ForeignKey("schedule_events.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("auth.users.id", ondelete="CASCADE"), primary_key=True)
    status = Column(String(20), nullable=False, default="invited")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
