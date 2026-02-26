"""Add activity feed supporting indexes

Revision ID: 007
Revises: 006
Create Date: 2026-02-26 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_comments_content_type_content_id_created_at
        ON comments(content_type, content_id, created_at DESC)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_shared_posts_project_visibility_type_created_at
        ON shared_posts(project_id, visibility, type, created_at DESC)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_research_notes_project_is_shared_updated_at
        ON research_notes(project_id, is_shared, updated_at DESC)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_schedule_events_project_created_at
        ON schedule_events(project_id, created_at DESC)
        """
    )


def downgrade() -> None:
    # Intentionally non-destructive in shared environments.
    pass
