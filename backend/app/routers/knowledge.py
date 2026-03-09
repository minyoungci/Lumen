from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user, require_admin
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.services.knowledge_index_service import get_health_summary, record_feedback, retrieve_knowledge

router = APIRouter()
admin_router = APIRouter()


def _verify_project_access(
    db: Session,
    project_id: Optional[UUID],
    current_user: RequestUser,
) -> None:
    if project_id is None:
        return

    project_exists = db.query(Project.id).filter(Project.id == project_id).first()
    if not project_exists:
        raise HTTPException(status_code=404, detail="Project not found")

    if current_user.role == "admin":
        return

    member = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == current_user.id,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this project")


class KnowledgeRetrieveRequest(BaseModel):
    query: str = Field(min_length=1, max_length=4000)
    project_id: Optional[UUID] = None
    source_types: Optional[list[str]] = None
    top_k: Optional[int] = Field(default=8, ge=1, le=20)


class KnowledgeFeedbackRequest(BaseModel):
    query_text: str = Field(min_length=1, max_length=4000)
    target_source_type: str = Field(min_length=1, max_length=40)
    target_source_id: UUID
    project_id: Optional[UUID] = None
    feedback_type: str = Field(default="up", pattern="^(up|down)$")
    relevance_score: Optional[int] = Field(default=None, ge=1, le=5)


@router.post("/retrieve", response_model=dict)
def retrieve(
    payload: KnowledgeRetrieveRequest,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    _verify_project_access(db, payload.project_id, current_user)

    source_types = set(payload.source_types or [])
    if source_types:
        allowed = {"research_note", "shared_post", "daily_log"}
        unknown = source_types - allowed
        if unknown:
            raise HTTPException(status_code=400, detail=f"Invalid source_type: {', '.join(sorted(unknown))}")

    results = retrieve_knowledge(
        db,
        current_user=current_user,
        query=payload.query,
        project_id=payload.project_id,
        source_types=source_types or None,
        top_k=payload.top_k,
    )

    return {
        "data": {
            "results": results,
            "query": payload.query,
            "total": len(results),
        }
    }


@router.post("/feedback", response_model=dict)
def feedback(
    payload: KnowledgeFeedbackRequest,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    _verify_project_access(db, payload.project_id, current_user)
    row = record_feedback(
        db,
        current_user=current_user,
        project_id=payload.project_id,
        query_text=payload.query_text,
        target_source_type=payload.target_source_type,
        target_source_id=payload.target_source_id,
        feedback_type=payload.feedback_type,
        relevance_score=payload.relevance_score,
    )
    return {
        "data": {
            "id": str(row.id),
            "created_at": row.created_at.isoformat() if row.created_at else None,
        },
        "message": "Feedback recorded",
    }


@admin_router.get("/health", response_model=dict)
def health(
    db: Session = Depends(get_db),
    _: RequestUser = Depends(require_admin),
):
    return {"data": get_health_summary(db)}


@admin_router.get("/reindex", response_model=dict)
def trigger_reindex(
    days: int = Query(default=2, ge=1, le=30),
    limit: int = Query(default=1000, ge=10, le=5000),
    _: RequestUser = Depends(require_admin),
):
    # Lazy import to avoid circular imports during app startup.
    from app.tasks.knowledge_index_task import run_knowledge_nightly_reindex

    async_result = run_knowledge_nightly_reindex.delay(days=days, limit=limit)
    return {
        "message": "Reindex queued",
        "task_id": str(async_result.id),
        "days": days,
        "limit": limit,
    }
