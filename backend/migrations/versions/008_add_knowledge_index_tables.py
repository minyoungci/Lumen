"""Add knowledge index tables

Revision ID: 008
Revises: 007
Create Date: 2026-02-28 15:10:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "knowledge_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source_type", sa.String(length=30), nullable=False),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_subtype", sa.String(length=30), nullable=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("visibility_scope", sa.String(length=20), nullable=False, server_default="private"),
        sa.Column("title", sa.String(length=300), nullable=False, server_default="Untitled"),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("keywords", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("meta_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("last_indexed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("source_type", "source_id", name="uq_knowledge_documents_source"),
    )
    op.create_index("ix_knowledge_documents_source_id", "knowledge_documents", ["source_id"])
    op.create_index("ix_knowledge_documents_project_id", "knowledge_documents", ["project_id"])
    op.create_index("ix_knowledge_documents_owner_user_id", "knowledge_documents", ["owner_user_id"])
    op.create_index("ix_knowledge_documents_visibility_scope", "knowledge_documents", ["visibility_scope"])

    op.create_table(
        "knowledge_chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("knowledge_document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("text_content", sa.Text(), nullable=False),
        sa.Column("token_estimate", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("embedding", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("keyword_blob", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["knowledge_document_id"], ["knowledge_documents.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("knowledge_document_id", "chunk_index", name="uq_knowledge_chunks_doc_index"),
    )
    op.create_index("ix_knowledge_chunks_knowledge_document_id", "knowledge_chunks", ["knowledge_document_id"])

    op.create_table(
        "knowledge_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("from_document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("to_document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("link_type", sa.String(length=40), nullable=False, server_default="semantic_similarity"),
        sa.Column("score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("evidence", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["from_document_id"], ["knowledge_documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["to_document_id"], ["knowledge_documents.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("from_document_id", "to_document_id", "link_type", name="uq_knowledge_links_pair_type"),
    )
    op.create_index("ix_knowledge_links_from_document_id", "knowledge_links", ["from_document_id"])
    op.create_index("ix_knowledge_links_to_document_id", "knowledge_links", ["to_document_id"])
    op.create_index("ix_knowledge_links_score", "knowledge_links", ["score"])

    op.create_table(
        "knowledge_index_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source_type", sa.String(length=30), nullable=False),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("job_type", sa.String(length=20), nullable=False, server_default="upsert"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="queued"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()),
    )
    op.create_index("ix_knowledge_index_jobs_source_type", "knowledge_index_jobs", ["source_type"])
    op.create_index("ix_knowledge_index_jobs_source_id", "knowledge_index_jobs", ["source_id"])
    op.create_index("ix_knowledge_index_jobs_status", "knowledge_index_jobs", ["status"])

    op.create_table(
        "knowledge_feedback",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("query_text", sa.Text(), nullable=False),
        sa.Column("target_source_type", sa.String(length=30), nullable=False),
        sa.Column("target_source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("feedback_type", sa.String(length=20), nullable=False, server_default="up"),
        sa.Column("relevance_score", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_knowledge_feedback_user_id", "knowledge_feedback", ["user_id"])
    op.create_index("ix_knowledge_feedback_project_id", "knowledge_feedback", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_knowledge_feedback_project_id", table_name="knowledge_feedback")
    op.drop_index("ix_knowledge_feedback_user_id", table_name="knowledge_feedback")
    op.drop_table("knowledge_feedback")

    op.drop_index("ix_knowledge_index_jobs_status", table_name="knowledge_index_jobs")
    op.drop_index("ix_knowledge_index_jobs_source_id", table_name="knowledge_index_jobs")
    op.drop_index("ix_knowledge_index_jobs_source_type", table_name="knowledge_index_jobs")
    op.drop_table("knowledge_index_jobs")

    op.drop_index("ix_knowledge_links_score", table_name="knowledge_links")
    op.drop_index("ix_knowledge_links_to_document_id", table_name="knowledge_links")
    op.drop_index("ix_knowledge_links_from_document_id", table_name="knowledge_links")
    op.drop_table("knowledge_links")

    op.drop_index("ix_knowledge_chunks_knowledge_document_id", table_name="knowledge_chunks")
    op.drop_table("knowledge_chunks")

    op.drop_index("ix_knowledge_documents_visibility_scope", table_name="knowledge_documents")
    op.drop_index("ix_knowledge_documents_owner_user_id", table_name="knowledge_documents")
    op.drop_index("ix_knowledge_documents_project_id", table_name="knowledge_documents")
    op.drop_index("ix_knowledge_documents_source_id", table_name="knowledge_documents")
    op.drop_table("knowledge_documents")
