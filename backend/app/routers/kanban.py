from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user
from app.models.kanban_column import KanbanColumn
from app.models.shared_post import SharedPost
from app.schemas.kanban_column import KanbanColumnCreate, KanbanColumnOut, KanbanColumnUpdate

router = APIRouter()



def _column_out(db: Session, row: KanbanColumn) -> KanbanColumnOut:
    cards_count = (
        db.query(func.count(SharedPost.id))
        .filter(SharedPost.deleted_at.is_(None), SharedPost.kanban_column == row.name)
        .scalar()
        or 0
    )

    return KanbanColumnOut(
        id=row.id,
        name=row.name,
        color=row.color,
        sort_order=row.sort_order,
        cards_count=int(cards_count),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/columns", response_model=dict)
def list_columns(
    db: Session = Depends(get_db),
    _: RequestUser = Depends(get_current_user),
):
    rows = db.query(KanbanColumn).order_by(KanbanColumn.sort_order.asc(), KanbanColumn.created_at.asc()).all()
    return {"data": [_column_out(db, r) for r in rows]}


@router.post("/columns", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_column(
    payload: KanbanColumnCreate,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    existing = db.query(KanbanColumn).filter(KanbanColumn.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=409, detail="Column already exists")

    max_sort = db.query(func.max(KanbanColumn.sort_order)).scalar()
    row = KanbanColumn(
        name=payload.name,
        color=payload.color,
        sort_order=(max_sort + 1) if max_sort is not None else 0,
        created_by=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {"data": _column_out(db, row), "message": "Column created"}


@router.patch("/columns/{column_id}", response_model=dict)
def update_column(
    column_id: UUID,
    payload: KanbanColumnUpdate,
    db: Session = Depends(get_db),
    _: RequestUser = Depends(get_current_user),
):
    row = db.query(KanbanColumn).filter(KanbanColumn.id == column_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Column not found")

    ALLOWED_COLUMN_FIELDS = {"name", "color", "sort_order"}
    updates = {
        k: v for k, v in payload.model_dump(exclude_unset=True).items()
        if k in ALLOWED_COLUMN_FIELDS
    }
    old_name = row.name

    if "name" in updates:
        conflict = db.query(KanbanColumn).filter(KanbanColumn.name == updates["name"], KanbanColumn.id != row.id).first()
        if conflict:
            raise HTTPException(status_code=409, detail="Column name already exists")

    for key, value in updates.items():
        setattr(row, key, value)

    db.add(row)

    # rename applied to existing cards
    if "name" in updates and old_name != row.name:
        cards = db.query(SharedPost).filter(SharedPost.kanban_column == old_name).all()
        for card in cards:
            card.kanban_column = row.name
            db.add(card)

    db.commit()
    db.refresh(row)

    return {"data": _column_out(db, row), "message": "Column updated"}


@router.delete("/columns/{column_id}", response_model=dict)
def delete_column(
    column_id: UUID,
    db: Session = Depends(get_db),
    _: RequestUser = Depends(get_current_user),
):
    row = db.query(KanbanColumn).filter(KanbanColumn.id == column_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Column not found")

    affected_cards = db.query(SharedPost).filter(SharedPost.kanban_column == row.name).all()
    for card in affected_cards:
        card.kanban_column = None
        card.kanban_order = None
        db.add(card)

    db.delete(row)
    db.commit()

    return {
        "data": {"deleted": True, "unassigned_cards": len(affected_cards)},
        "message": "Column deleted",
    }
