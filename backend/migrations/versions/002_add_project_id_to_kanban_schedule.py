"""Add multitenancy and profile preference columns

Revision ID: 002
Revises: 001
Create Date: 2026-02-22 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS projects (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(200) NOT NULL,
            description TEXT,
            invite_token VARCHAR(64) UNIQUE NOT NULL,
            created_by_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS project_members (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            role VARCHAR(20) NOT NULL DEFAULT 'member',
            joined_at TIMESTAMPTZ DEFAULT now(),
            CONSTRAINT uq_project_members_project_user UNIQUE (project_id, user_id)
        )
        """
    )

    op.execute(
        """
        ALTER TABLE daily_logs
        ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft'
        """
    )
    op.execute(
        """
        ALTER TABLE daily_logs
        ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL
        """
    )

    op.execute(
        """
        ALTER TABLE shared_posts
        ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'shared'
        """
    )
    op.execute(
        """
        ALTER TABLE shared_posts
        ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL
        """
    )

    op.execute(
        """
        ALTER TABLE research_notes
        ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL
        """
    )

    op.execute(
        """
        ALTER TABLE kanban_columns
        ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE
        """
    )
    op.execute(
        """
        ALTER TABLE schedule_events
        ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE
        """
    )

    op.execute(
        """
        ALTER TABLE user_profiles
        ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb
        """
    )

    op.execute("CREATE INDEX IF NOT EXISTS ix_project_members_project_id ON project_members(project_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_project_members_user_id ON project_members(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_daily_logs_project_id ON daily_logs(project_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_research_notes_project_id ON research_notes(project_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_shared_posts_project_id ON shared_posts(project_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_kanban_columns_project_id ON kanban_columns(project_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_schedule_events_project_id ON schedule_events(project_id)")


def downgrade() -> None:
    # Destructive rollback is intentionally omitted for safety in shared environments.
    pass
