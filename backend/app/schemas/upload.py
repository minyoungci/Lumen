from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class UploadOut(BaseModel):
    id: UUID
    filename: str
    original_name: str
    mime_type: str
    size_bytes: int
    public_url: str
    file_type: str
    created_at: Optional[datetime] = None
