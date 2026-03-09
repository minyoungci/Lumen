"""Add site settings table for admin CMS

Revision ID: 006
Revises: 005
Create Date: 2026-02-23 00:45:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS site_settings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            scope VARCHAR(50) NOT NULL UNIQUE,
            published_config JSONB NOT NULL DEFAULT '{}'::jsonb,
            draft_config JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_by UUID,
            published_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_site_settings_scope
        ON site_settings(scope)
        """
    )

    op.execute(
        """
        INSERT INTO site_settings(scope, published_config, draft_config, published_at)
        VALUES ('global', '{}'::jsonb, '{}'::jsonb, now())
        ON CONFLICT(scope) DO NOTHING
        """
    )


def downgrade() -> None:
    # Intentionally non-destructive in shared environments.
    pass
