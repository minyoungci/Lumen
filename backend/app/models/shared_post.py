from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Integer, Boolean, JSON, DateTime as saDateTime
from sqlalchemy.dialects.postgresql import UUID, TSVECTOR
from sqlalchemy.sql import func
import uuid

from app.database import Base

class SharedPost(Base):
    __tablename__ = "shared_posts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("auth.users.id", ondelete="CASCADE"), nullable=False)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    type = Column(String(20), nullable=False)
    title = Column(String(300), nullable=False)
    content = Column(JSON, nullable=False, default={})
    cover_image_url = Column(Text, nullable=True)
    kanban_column = Column(String(100), nullable=True)
    kanban_order = Column(Integer, nullable=True)
    is_pinned = Column(Boolean, nullable=False, default=False)
    visibility = Column(String(20), nullable=False, server_default="shared")
    word_count = Column(Integer, nullable=False, default=0)
    reading_time = Column(Integer, nullable=False, default=0)
    view_count = Column(Integer, nullable=False, default=0)
    deleted_at = Column(saDateTime, nullable=True)
    search_vector = Column(TSVECTOR, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
