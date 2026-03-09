"""Add project invite codes table

Revision ID: 005
Revises: 004
Create Date: 2026-02-22 23:30:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS project_invite_codes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            code VARCHAR(16) NOT NULL UNIQUE,
            created_by_id UUID NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            usage_count INTEGER NOT NULL DEFAULT 0,
            usage_limit INTEGER,
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT now()
        )
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_project_invite_codes_project_id
        ON project_invite_codes(project_id)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_project_invite_codes_code
        ON project_invite_codes(code)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_project_invite_codes_active
        ON project_invite_codes(is_active)
        """
    )


def downgrade() -> None:
    # Intentionally non-destructive in shared environments.
    pass
