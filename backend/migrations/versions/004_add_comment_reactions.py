"""Add comment reactions table

Revision ID: 004
Revises: 003
Create Date: 2026-02-22 19:20:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS comment_reactions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
            user_id UUID NOT NULL,
            emoji VARCHAR(16) NOT NULL DEFAULT '👍',
            created_at TIMESTAMPTZ DEFAULT now(),
            CONSTRAINT uq_comment_reactions_comment_user UNIQUE (comment_id, user_id)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_comment_reactions_comment_id
        ON comment_reactions(comment_id)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_comment_reactions_user_id
        ON comment_reactions(user_id)
        """
    )


def downgrade() -> None:
    # Intentionally non-destructive in shared environments.
    pass
