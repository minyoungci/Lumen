"""Ensure user_profiles.preferences column exists

Revision ID: 003
Revises: 002
Create Date: 2026-02-22 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Some environments were already on revision 002 before the preferences
    # column was added there. Keep this migration idempotent to reconcile.
    op.execute(
        """
        ALTER TABLE user_profiles
        ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb
        """
    )


def downgrade() -> None:
    # Intentionally non-destructive in shared environments.
    pass

