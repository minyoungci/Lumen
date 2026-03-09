from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_recycle=3600,
    pool_pre_ping=True,
    echo=False,
    future=True,
) if settings.DATABASE_URL else None
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) if engine else None
Base = declarative_base()

def get_db():
    if SessionLocal is None:
        raise RuntimeError("Database not configured")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Import all models for Alembic
from app.models.auth_user import AuthUser
from app.models.user import UserProfile
from app.models.daily_log import DailyLog
from app.models.ai_summary import AiSummary
from app.models.research_note import ResearchNote
from app.models.note_version import NoteVersion
from app.models.shared_post import SharedPost
from app.models.post_read_status import PostReadStatus
from app.models.tag import Tag
from app.models.content_tag import ContentTag
from app.models.comment import Comment
from app.models.comment_reaction import CommentReaction
from app.models.mention import Mention
from app.models.notification import Notification
from app.models.schedule import ScheduleEvent
from app.models.schedule_attendee import ScheduleEventAttendee
from app.models.upload import Upload
from app.models.bookmark import Bookmark
from app.models.kanban_column import KanbanColumn
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.project_invite_code import ProjectInviteCode
from app.models.site_setting import SiteSetting
from app.models.knowledge_document import KnowledgeDocument
from app.models.knowledge_chunk import KnowledgeChunk
from app.models.knowledge_link import KnowledgeLink
from app.models.knowledge_index_job import KnowledgeIndexJob
from app.models.knowledge_feedback import KnowledgeFeedback
