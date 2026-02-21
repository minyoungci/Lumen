from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Integer, Boolean, JSON, DateTime as saDateTime
from sqlalchemy.dialects.postgresql import UUID, TSVECTOR
from sqlalchemy.sql import func
import uuid

from app.database import Base

class ResearchNote(Base):
    __tablename__ = "research_notes"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("auth.users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(300), nullable=False, default="Untitled Note")
    content = Column(JSON, nullable=False, default={})
    cover_image_url = Column(Text, nullable=True)
    is_shared = Column(Boolean, nullable=False, default=False)
    is_pinned = Column(Boolean, nullable=False, default=False)
    word_count = Column(Integer, nullable=False, default=0)
    reading_time = Column(Integer, nullable=False, default=0)
    due_date = Column(saDateTime, nullable=True)
    deleted_at = Column(saDateTime, nullable=True)
    search_vector = Column(TSVECTOR, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
