from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Integer, Date, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid

from app.database import Base

class DailyLog(Base):
    __tablename__ = "daily_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("auth.users.id", ondelete="CASCADE"), nullable=False)
    log_date = Column(Date, nullable=False)
    content = Column(JSON, nullable=False, default={})
    word_count = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, server_default="draft")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
