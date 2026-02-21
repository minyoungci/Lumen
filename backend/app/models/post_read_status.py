from sqlalchemy import Column, String, DateTime, ForeignKey, DateTime as saDateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid

from app.database import Base

class PostReadStatus(Base):
    __tablename__ = "post_read_status"
    
    post_id = Column(UUID(as_uuid=True), ForeignKey("shared_posts.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("auth.users.id", ondelete="CASCADE"), primary_key=True)
    read_at = Column(DateTime(timezone=True), server_default=func.now())
