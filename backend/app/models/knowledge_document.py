from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func
import uuid

from app.database import Base


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"
    __table_args__ = (
        UniqueConstraint("source_type", "source_id", name="uq_knowledge_documents_source"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_type = Column(String(30), nullable=False)
    source_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    source_subtype = Column(String(30), nullable=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    owner_user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    visibility_scope = Column(String(20), nullable=False, default="private")
    title = Column(String(300), nullable=False, default="Untitled")
    summary = Column(Text, nullable=True)
    keywords = Column(JSONB, nullable=False, default=list)
    content_hash = Column(String(64), nullable=False)
    meta_json = Column(JSONB, nullable=False, default=dict)
    last_indexed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    is_deleted = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
