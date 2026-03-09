from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user
from app.models.kanban_column import KanbanColumn
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.shared_post import SharedPost
from app.schemas.kanban_column import KanbanColumnCreate, KanbanColumnOut, KanbanColumnUpdate

router = APIRouter()


# ── helpers ──────────────────────────────────────────────────────────────────

def _verify_member(db: Session, project_id: UUID, current_user: RequestUser) -> None:
    project_exists = db.query(Project.id).filter(Project.id == project_id).first()
    if not project_exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if current_user.role == "admin":
        return

    member = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == current_user.id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this project")


def _column_out(db: Session, row: KanbanColumn, project_id: Optional[UUID] = None) -> KanbanColumnOut:
    q = db.query(func.count(SharedPost.id)).filter(
        SharedPost.deleted_at.is_(None),
        SharedPost.kanban_column == row.name,
    )
    if project_id is not None:
        q = q.filter(SharedPost.project_id == project_id)
    else:
        q = q.filter(SharedPost.project_id.is_(None))
    cards_count = q.scalar() or 0

    return KanbanColumnOut(
        id=row.id,
        name=row.name,
        color=row.color,
        sort_order=row.sort_order,
        cards_count=int(cards_count),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _project_filter(q, project_id: Optional[UUID]):
    """Apply project_id filter to a query on KanbanColumn."""
    if project_id is not None:
        return q.filter(KanbanColumn.project_id == project_id)
    return q.filter(KanbanColumn.project_id.is_(None))


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/columns", response_model=dict)
def list_columns(
    project_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    if project_id is not None:
        _verify_member(db, project_id, current_user)

    q = db.query(KanbanColumn)
    q = _project_filter(q, project_id)
    rows = q.order_by(KanbanColumn.sort_order.asc(), KanbanColumn.created_at.asc()).all()
    return {"data": [_column_out(db, r, project_id) for r in rows]}


@router.post("/columns", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_column(
    payload: KanbanColumnCreate,
    project_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    if project_id is not None:
        _verify_member(db, project_id, current_user)

    q = db.query(KanbanColumn).filter(KanbanColumn.name == payload.name)
    existing = _project_filter(q, project_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Column already exists")

    max_sort_q = db.query(func.max(KanbanColumn.sort_order))
    max_sort_q = _project_filter(max_sort_q, project_id)
    max_sort = max_sort_q.scalar()

    row = KanbanColumn(
        project_id=project_id,
        name=payload.name,
        color=payload.color,
        sort_order=(max_sort + 1) if max_sort is not None else 0,
        created_by=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {"data": _column_out(db, row, project_id), "message": "Column created"}


@router.patch("/columns/{column_id}", response_model=dict)
def update_column(
    column_id: UUID,
    payload: KanbanColumnUpdate,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    row = db.query(KanbanColumn).filter(KanbanColumn.id == column_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Column not found")

    if row.project_id is not None:
        _verify_member(db, row.project_id, current_user)

    ALLOWED = {"name", "color", "sort_order"}
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if k in ALLOWED}
    old_name = row.name

    if "name" in updates:
        q = db.query(KanbanColumn).filter(
            KanbanColumn.name == updates["name"],
            KanbanColumn.id != row.id,
        )
        if _project_filter(q, row.project_id).first():
            raise HTTPException(status_code=409, detail="Column name already exists")

    for key, value in updates.items():
        setattr(row, key, value)
    db.add(row)

    if "name" in updates and old_name != row.name:
        cards = db.query(SharedPost).filter(SharedPost.kanban_column == old_name)
        if row.project_id is not None:
            cards = cards.filter(SharedPost.project_id == row.project_id)
        else:
            cards = cards.filter(SharedPost.project_id.is_(None))
        for card in cards.all():
            card.kanban_column = row.name
            db.add(card)

    db.commit()
    db.refresh(row)
    return {"data": _column_out(db, row, row.project_id), "message": "Column updated"}


@router.delete("/columns/{column_id}", response_model=dict)
def delete_column(
    column_id: UUID,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    row = db.query(KanbanColumn).filter(KanbanColumn.id == column_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Column not found")

    if row.project_id is not None:
        _verify_member(db, row.project_id, current_user)

    cards = db.query(SharedPost).filter(SharedPost.kanban_column == row.name)
    if row.project_id is not None:
        cards = cards.filter(SharedPost.project_id == row.project_id)
    else:
        cards = cards.filter(SharedPost.project_id.is_(None))
    affected = cards.all()
    for card in affected:
        card.kanban_column = None
        card.kanban_order = None
        db.add(card)

    db.delete(row)
    db.commit()

    return {
        "data": {"deleted": True, "unassigned_cards": len(affected)},
        "message": "Column deleted",
    }
