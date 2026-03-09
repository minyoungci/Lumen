from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user
from app.models.note_version import NoteVersion
from app.models.project import Project
from app.models.research_note import ResearchNote
from app.schemas.research_note import (
    ResearchNoteCreate,
    ResearchNoteListItem,
    ResearchNoteOut,
    ResearchNoteUpdate,
)
from app.tasks.knowledge_index_task import queue_delete as queue_knowledge_delete
from app.tasks.knowledge_index_task import queue_upsert as queue_knowledge_upsert

router = APIRouter()


def _is_project_member(db: Session, project_id: UUID, user_id: UUID) -> bool:
    from app.models.project_member import ProjectMember

    return (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
        .first()
        is not None
    )


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
    if not _is_project_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member of this project")



def _extract_preview(content: dict, max_len: int = 140) -> str:
    if not isinstance(content, dict):
        return ""
    text = content.get("text")
    if isinstance(text, str):
        return text[:max_len]
    blocks = content.get("blocks")
    if isinstance(blocks, list):
        joined = " ".join(str(b.get("text", "")) for b in blocks if isinstance(b, dict))
        return joined[:max_len]
    return str(content)[:max_len]


@router.get("", response_model=dict)
def list_research_notes(
    scope: str = Query(default="mine"),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: Optional[str] = Query(default=None),
    project_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    q = db.query(ResearchNote).filter(ResearchNote.deleted_at.is_(None))

    if project_id is not None:
        _verify_project_access(db, project_id, current_user)
        q = q.filter(ResearchNote.project_id == project_id)
    else:
        if scope == "mine":
            q = q.filter(ResearchNote.user_id == current_user.id).filter(ResearchNote.project_id.is_(None))
        elif scope == "shared":
            q = q.filter(ResearchNote.is_shared.is_(True)).filter(ResearchNote.project_id.is_(None))
        else:
            raise HTTPException(status_code=400, detail="scope must be mine or shared")

    if search:
        pattern = f"%{search}%"
        q = q.filter(or_(ResearchNote.title.ilike(pattern)))

    if cursor:
        try:
            cursor_uuid = UUID(cursor)
            q = q.filter(ResearchNote.id < cursor_uuid)
        except ValueError:
            pass

    rows = q.order_by(ResearchNote.updated_at.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = str(rows[-1].id) if has_more and rows else None

    data = [
        ResearchNoteListItem(
            id=row.id,
            title=row.title,
            preview=_extract_preview(row.content),
            is_shared=row.is_shared,
            is_pinned=row.is_pinned,
            word_count=row.word_count,
            reading_time=row.reading_time,
            updated_at=row.updated_at,
        )
        for row in rows
    ]

    return {
        "data": data,
        "pagination": {
            "has_more": has_more,
            "next_cursor": next_cursor,
            "total": len(data),
        },
    }


@router.get("/{note_id}", response_model=dict)
def get_research_note(
    note_id: UUID,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    row = db.query(ResearchNote).filter(ResearchNote.id == note_id).first()
    if not row or row.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research note not found")

    _verify_project_access(db, row.project_id, current_user)

    if (not row.is_shared) and row.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return {"data": ResearchNoteOut.model_validate(row)}


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_research_note(
    payload: ResearchNoteCreate,
    project_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    _verify_project_access(db, project_id, current_user)

    row = ResearchNote(user_id=current_user.id, project_id=project_id, **payload.model_dump())
    try:
        db.add(row)
        db.commit()
        db.refresh(row)

        version = NoteVersion(
            note_id=row.id,
            user_id=current_user.id,
            content=row.content,
            title=row.title,
            version_num=1,
        )
        db.add(version)
        db.commit()
        try:
            queue_knowledge_upsert("research_note", row.id)
        except Exception:
            pass
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {"data": ResearchNoteOut.model_validate(row), "message": "Created"}


@router.patch("/{note_id}", response_model=dict)
def update_research_note(
    note_id: UUID,
    payload: ResearchNoteUpdate,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    row = db.query(ResearchNote).filter(ResearchNote.id == note_id).first()
    if not row or row.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research note not found")
    if row.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only author can update")

    ALLOWED_NOTE_FIELDS = {"title", "content", "is_shared", "is_pinned", "word_count", "reading_time"}
    updates = {
        k: v for k, v in payload.model_dump(exclude_unset=True).items()
        if k in ALLOWED_NOTE_FIELDS
    }

    if updates:
        current_version = (
            db.query(NoteVersion)
            .filter(NoteVersion.note_id == row.id)
            .order_by(NoteVersion.version_num.desc())
            .first()
        )
        next_version = (current_version.version_num if current_version else 0) + 1

        snapshot = NoteVersion(
            note_id=row.id,
            user_id=current_user.id,
            content=row.content,
            title=row.title,
            version_num=next_version,
        )
        db.add(snapshot)

    for key, value in updates.items():
        setattr(row, key, value)

    try:
        db.add(row)
        db.commit()
        db.refresh(row)
        try:
            queue_knowledge_upsert("research_note", row.id)
        except Exception:
            pass
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {"data": ResearchNoteOut.model_validate(row), "message": "Updated"}


@router.delete("/{note_id}", response_model=dict)
def delete_research_note(
    note_id: UUID,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    row = db.query(ResearchNote).filter(ResearchNote.id == note_id).first()
    if not row or row.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research note not found")
    if row.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only author can delete")

    from datetime import datetime

    row.deleted_at = datetime.utcnow()
    try:
        db.add(row)
        db.commit()
        try:
            queue_knowledge_delete("research_note", row.id)
        except Exception:
            pass
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {"message": "Deleted"}


@router.post("/{note_id}/restore", response_model=dict)
def restore_research_note(
    note_id: UUID,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    row = db.query(ResearchNote).filter(ResearchNote.id == note_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research note not found")
    if row.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only author can restore")

    row.deleted_at = None
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
        try:
            queue_knowledge_upsert("research_note", row.id)
        except Exception:
            pass
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {"data": ResearchNoteOut.model_validate(row), "message": "Restored"}
