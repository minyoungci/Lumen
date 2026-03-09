from __future__ import annotations

from typing import Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user
from app.models.upload import Upload
from app.schemas.upload import UploadOut
from app.services.storage_service import storage_service
from app.utils.upload_rules import (
    MAX_FILE_SIZE,
    ensure_within_size_limit,
    extension,
    resolve_upload_content_type,
)

router = APIRouter()


def _to_upload_out(row: Upload) -> UploadOut:
    return UploadOut(
        id=row.id,
        filename=row.filename,
        original_name=row.original_name,
        mime_type=row.mime_type,
        size_bytes=row.size_bytes,
        public_url=storage_service.resolve_public_url(row.public_url) or row.public_url,
        file_type=row.file_type,
        created_at=row.created_at,
    )


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    file_type: str = Form(...),
    context_type: Optional[str] = Form(default=None),
    context_id: Optional[UUID] = Form(default=None),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    content = await file.read()
    ensure_within_size_limit(content, MAX_FILE_SIZE)

    original_name = file.filename or ""
    normalized_file_type, resolved_content_type = resolve_upload_content_type(
        file_type=file_type,
        filename=original_name,
        content_type=file.content_type,
        content=content,
    )
    ext = extension(original_name)
    upload_key = uuid4().hex
    filename = f"{upload_key}{ext}"

    try:
        stored = storage_service.upload_user_upload(
            user_id=current_user.id,
            upload_key=upload_key,
            filename=filename,
            content=content,
            content_type=resolved_content_type,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    row = Upload(
        user_id=current_user.id,
        filename=filename,
        original_name=file.filename or filename,
        mime_type=resolved_content_type,
        size_bytes=len(content),
        storage_path=stored.storage_path,
        public_url=stored.public_url,
        file_type=normalized_file_type,
        context_type=context_type,
        context_id=context_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "data": _to_upload_out(row),
        "message": "File uploaded",
    }


@router.get("", response_model=dict)
def list_uploads(
    file_type: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    q = db.query(Upload).filter(Upload.user_id == current_user.id)
    if file_type:
        q = q.filter(Upload.file_type == file_type)

    if cursor:
        try:
            q = q.filter(Upload.id < UUID(cursor))
        except ValueError:
            pass

    rows = q.order_by(Upload.created_at.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = str(rows[-1].id) if has_more and rows else None

    data = [
        {
            "id": r.id,
            "original_name": r.original_name,
            "public_url": storage_service.resolve_public_url(r.public_url) or r.public_url,
            "file_type": r.file_type,
            "size_bytes": r.size_bytes,
            "created_at": r.created_at,
        }
        for r in rows
    ]

    return {
        "data": data,
        "pagination": {
            "has_more": has_more,
            "next_cursor": next_cursor,
            "total": len(data),
        },
    }


@router.delete("/{upload_id}", response_model=dict)
def delete_upload(
    upload_id: UUID,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    row = db.query(Upload).filter(Upload.id == upload_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")
    if row.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner/admin can delete")

    storage_service.delete(row.storage_path)

    db.delete(row)
    db.commit()

    return {"data": {"deleted": True}, "message": "File deleted"}
