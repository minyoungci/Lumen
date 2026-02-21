from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Integer, Boolean, DateTime as saDateTime
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.sql import func
import uuid

from app.database import Base

class AiSummary(Base):
    __tablename__ = "ai_summaries"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("auth.users.id", ondelete="CASCADE"), nullable=False)
    summary_date = Column(saDateTime, nullable=False)
    period = Column(String(20), nullable=False, default="daily")
    summary_text = Column(Text, nullable=False)
    key_topics = Column(ARRAY(String), default=[])
    activity_score = Column(Integer, nullable=True)
    model_used = Column(String(50), nullable=False)
    token_count = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
