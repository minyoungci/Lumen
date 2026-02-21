from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class AuthUser(Base):
    """Shadow model for Supabase auth.users to satisfy SQLAlchemy FK resolution in local dev.

    This table is not managed by our Alembic migrations in local Option A setup.
    """

    __tablename__ = "users"
    __table_args__ = {"schema": "auth"}

    id = Column(UUID(as_uuid=True), primary_key=True)
