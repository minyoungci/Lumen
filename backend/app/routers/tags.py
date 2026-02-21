from __future__ import annotations

import re
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user, require_admin
from app.models.content_tag import ContentTag
from app.models.tag import Tag
from app.models.user import UserProfile
from app.schemas.tag import TagAuthor, TagCreate, TagOut, TagUpdate

router = APIRouter()



def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower())
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "tag"


@router.get("", response_model=dict)
def list_tags(
    search: Optional[str] = Query(default=None),
    content_type: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _: RequestUser = Depends(get_current_user),
):
    q = db.query(Tag)

    if search:
        pattern = f"%{search}%"
        q = q.filter((Tag.name.ilike(pattern)) | (Tag.description.ilike(pattern)))

    if content_type:
        q = (
            q.join(ContentTag, ContentTag.tag_id == Tag.id)
            .filter(ContentTag.content_type == content_type)
            .distinct()
        )

    rows = q.order_by(Tag.name.asc()).all()

    usage_counts = {
        tag_id: count
        for tag_id, count in db.query(ContentTag.tag_id, func.count(ContentTag.id))
        .group_by(ContentTag.tag_id)
        .all()
    }

    users = {
        u.id: u
        for u in db.query(UserProfile.id, UserProfile.display_name)
        .filter(UserProfile.id.in_([r.created_by for r in rows if r.created_by is not None]))
        .all()
    }

    data = []
    for row in rows:
        author = None
        if row.created_by and row.created_by in users:
            u = users[row.created_by]
            author = TagAuthor(id=u.id, display_name=u.display_name)

        data.append(
            TagOut(
                id=row.id,
                name=row.name,
                slug=row.slug,
                color=row.color,
                description=row.description,
                usage_count=int(usage_counts.get(row.id, 0)),
                created_by=author,
                created_at=row.created_at,
            )
        )

    return {"data": data}


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_tag(
    payload: TagCreate,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    slug = _slugify(payload.name)

    existing = db.query(Tag).filter((Tag.name == payload.name) | (Tag.slug == slug)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tag already exists")

    row = Tag(
        name=payload.name,
        slug=slug,
        color=payload.color,
        description=payload.description,
        created_by=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    creator = db.query(UserProfile).filter(UserProfile.id == current_user.id).first()

    return {
        "data": TagOut(
            id=row.id,
            name=row.name,
            slug=row.slug,
            color=row.color,
            description=row.description,
            usage_count=0,
            created_by=TagAuthor(
                id=current_user.id,
                display_name=creator.display_name if creator else "unknown",
            ),
            created_at=row.created_at,
        ),
        "message": "Tag created",
    }


@router.patch("/{tag_id}", response_model=dict)
def update_tag(
    tag_id: UUID,
    payload: TagUpdate,
    db: Session = Depends(get_db),
    _: RequestUser = Depends(require_admin),
):
    row = db.query(Tag).filter(Tag.id == tag_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")

    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates and updates["name"]:
        updates["slug"] = _slugify(updates["name"])

    if "slug" in updates:
        conflict = (
            db.query(Tag)
            .filter(Tag.id != row.id)
            .filter((Tag.name == updates.get("name", row.name)) | (Tag.slug == updates["slug"]))
            .first()
        )
        if conflict:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tag conflict")

    ALLOWED_TAG_FIELDS = {"name", "color", "description", "slug"}
    for key, value in updates.items():
        if key in ALLOWED_TAG_FIELDS:
            setattr(row, key, value)

    db.add(row)
    db.commit()
    db.refresh(row)

    usage_count = db.query(func.count(ContentTag.id)).filter(ContentTag.tag_id == row.id).scalar() or 0

    return {
        "data": TagOut(
            id=row.id,
            name=row.name,
            slug=row.slug,
            color=row.color,
            description=row.description,
            usage_count=int(usage_count),
            created_by=None,
            created_at=row.created_at,
        ),
        "message": "Tag updated",
    }


@router.delete("/{tag_id}", response_model=dict)
def delete_tag(
    tag_id: UUID,
    db: Session = Depends(get_db),
    _: RequestUser = Depends(require_admin),
):
    row = db.query(Tag).filter(Tag.id == tag_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")

    removed_associations = db.query(func.count(ContentTag.id)).filter(ContentTag.tag_id == row.id).scalar() or 0
    db.query(ContentTag).filter(ContentTag.tag_id == row.id).delete()
    db.delete(row)
    db.commit()

    return {
        "data": {"deleted": True, "removed_associations": int(removed_associations)},
        "message": "Tag deleted",
    }
