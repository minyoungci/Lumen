from sqlalchemy import Column, String, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.sql import func
import uuid

from app.database import Base

class NoteVersion(Base):
    __tablename__ = "note_versions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    note_id = Column(UUID(as_uuid=True), ForeignKey("research_notes.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("auth.users.id", ondelete="CASCADE"), nullable=False)
    content = Column(JSON, nullable=False)
    title = Column(String(300), nullable=False)
    version_num = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
