from sqlalchemy import Column, DateTime, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func
import uuid

from app.database import Base


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"
    __table_args__ = (
        UniqueConstraint("knowledge_document_id", "chunk_index", name="uq_knowledge_chunks_doc_index"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    knowledge_document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chunk_index = Column(Integer, nullable=False)
    text_content = Column(Text, nullable=False)
    token_estimate = Column(Integer, nullable=False, default=0)
    embedding = Column(JSONB, nullable=True)
    keyword_blob = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
