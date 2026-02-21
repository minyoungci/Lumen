from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Boolean, DateTime as saDateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid

from app.database import Base

class ScheduleEvent(Base):
    __tablename__ = "schedule_events"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_by = Column(UUID(as_uuid=True), ForeignKey("auth.users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    start_time = Column(saDateTime, nullable=False)
    end_time = Column(saDateTime, nullable=False)
    is_all_day = Column(Boolean, nullable=False, default=False)
    location = Column(String(200), nullable=True)
    color = Column(String(20), nullable=True, default="blue")
    reminder_sent = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
