from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional
from uuid import UUID

from app.config import settings

LOCAL_UPLOAD_ROOT = Path(settings.UPLOAD_DIR)


@dataclass
class StoredObject:
    storage_path: str
    public_url: str


class StorageService:
    def __init__(self) -> None:
        self._supabase = None

    @property
    def supabase(self):
        if self._supabase is not None:
            return self._supabase

        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
            return None

        try:
            from supabase import create_client

            self._supabase = create_client(
                settings.SUPABASE_URL,
                settings.SUPABASE_SERVICE_ROLE_KEY,
            )
            return self._supabase
        except Exception:
            return None

    def upload_user_upload(
        self,
        user_id: UUID,
        upload_key: str,
        filename: str,
        content: bytes,
        content_type: str,
    ) -> StoredObject:
        """Store upload in Supabase Storage when available, fallback to local fs."""
        object_path = f"{user_id}/{upload_key}/{filename}"

        # Try Supabase storage first.
        client = self.supabase
        if client is not None:
            try:
                client.storage.from_("uploads").upload(
                    path=object_path,
                    file=content,
                    file_options={"content-type": content_type, "upsert": "false"},
                )
                # uploads bucket is private by design; store canonical URI
                uri = f"supabase://uploads/{object_path}"
                return StoredObject(storage_path=uri, public_url=uri)
            except Exception:
                # fallback to local storage in dev environments
                pass

        # Local fallback
        storage_dir = LOCAL_UPLOAD_ROOT / str(user_id) / upload_key
        storage_dir.mkdir(parents=True, exist_ok=True)
        full_path = storage_dir / filename
        full_path.write_bytes(content)

        return StoredObject(
            storage_path=str(full_path),
            public_url=f"/uploads/files/{filename}",
        )

    def delete(self, storage_path: Optional[str]) -> None:
        if not storage_path:
            return

        if storage_path.startswith("supabase://uploads/"):
            client = self.supabase
            if client is None:
                return

            object_path = storage_path.removeprefix("supabase://uploads/")
            try:
                client.storage.from_("uploads").remove([object_path])
            except Exception:
                return
            return

        # local path
        try:
            if os.path.exists(storage_path):
                os.remove(storage_path)
        except OSError:
            return


@lru_cache(maxsize=1)
def get_storage_service() -> StorageService:
    return StorageService()


storage_service = get_storage_service()
