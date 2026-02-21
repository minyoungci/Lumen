from __future__ import annotations

from pathlib import Path
from typing import Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user
from app.models.upload import Upload
from app.schemas.upload import UploadOut
from app.services.storage_service import storage_service

router = APIRouter()

MAX_FILE_SIZE = 20 * 1024 * 1024

ALLOWED_BY_TYPE = {
    "image": {"image/jpeg", "image/png", "image/gif", "image/webp"},
    "code": {
        "text/plain",
        "application/json",
        "text/x-python",
        "application/javascript",
        "text/javascript",
        "text/markdown",
    },
    "document": {
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
    },
}



def _extension(name: str) -> str:
    suffix = Path(name).suffix.strip().lower()
    if not suffix:
        return ""
    return suffix if suffix.startswith(".") else f".{suffix}"


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    file_type: str = Form(...),
    context_type: Optional[str] = Form(default=None),
    context_id: Optional[UUID] = Form(default=None),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    content_type = file.content_type or "application/octet-stream"

    allowed = ALLOWED_BY_TYPE.get(file_type)
    if file_type != "other" and allowed is not None and content_type not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file MIME type: {content_type}")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 20MB)")

    ext = _extension(file.filename or "")
    upload_key = uuid4().hex
    filename = f"{upload_key}{ext}"

    stored = storage_service.upload_user_upload(
        user_id=current_user.id,
        upload_key=upload_key,
        filename=filename,
        content=content,
        content_type=content_type,
    )

    row = Upload(
        user_id=current_user.id,
        filename=filename,
        original_name=file.filename or filename,
        mime_type=content_type,
        size_bytes=len(content),
        storage_path=stored.storage_path,
        public_url=stored.public_url,
        file_type=file_type,
        context_type=context_type,
        context_id=context_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "data": UploadOut(
            id=row.id,
            filename=row.filename,
            original_name=row.original_name,
            mime_type=row.mime_type,
            size_bytes=row.size_bytes,
            public_url=row.public_url,
            file_type=row.file_type,
            created_at=row.created_at,
        ),
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
            "public_url": r.public_url,
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
