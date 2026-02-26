from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional
from urllib.parse import unquote, urlparse
from uuid import UUID

from app.config import settings

LOCAL_UPLOAD_ROOT = Path(settings.UPLOAD_DIR)
SUPABASE_UPLOAD_URI_PREFIX = "supabase://uploads/"
SUPABASE_SIGNED_PATH_PREFIX = "/storage/v1/object/sign/uploads/"
SUPABASE_PUBLIC_PATH_PREFIX = "/storage/v1/object/public/uploads/"
SUPABASE_AUTHENTICATED_PATH_PREFIX = "/storage/v1/object/authenticated/uploads/"
DEFAULT_SIGNED_URL_EXPIRES = 60 * 60 * 24 * 7


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
                uri = f"{SUPABASE_UPLOAD_URI_PREFIX}{object_path}"
                return StoredObject(storage_path=uri, public_url=uri)
            except Exception as exc:
                # In production mode, fail fast when remote storage is unavailable.
                if not settings.DEV_BYPASS_AUTH:
                    raise RuntimeError("Supabase storage upload failed") from exc
                # fallback to local storage in dev environments
                pass
        elif not settings.DEV_BYPASS_AUTH:
            raise RuntimeError("Supabase storage is not configured")

        # Local fallback
        storage_dir = LOCAL_UPLOAD_ROOT / str(user_id) / upload_key
        storage_dir.mkdir(parents=True, exist_ok=True)
        full_path = storage_dir / filename
        full_path.write_bytes(content)

        return StoredObject(
            storage_path=str(full_path),
            public_url=f"/uploads/files/{user_id}/{upload_key}/{filename}",
        )

    def canonicalize_upload_url(self, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None

        if not isinstance(value, str):
            return None

        cleaned = value.strip()
        if not cleaned:
            return None

        if cleaned.startswith(SUPABASE_UPLOAD_URI_PREFIX):
            return cleaned

        parsed = urlparse(cleaned)
        path = parsed.path or ""
        for prefix in (
            SUPABASE_SIGNED_PATH_PREFIX,
            SUPABASE_PUBLIC_PATH_PREFIX,
            SUPABASE_AUTHENTICATED_PATH_PREFIX,
        ):
            if path.startswith(prefix):
                object_path = unquote(path[len(prefix):].lstrip("/"))
                if object_path:
                    return f"{SUPABASE_UPLOAD_URI_PREFIX}{object_path}"
        return cleaned

    def resolve_public_url(self, value: Optional[str], expires_in: int = DEFAULT_SIGNED_URL_EXPIRES) -> Optional[str]:
        canonical = self.canonicalize_upload_url(value)
        if canonical is None:
            return None
        if not canonical.startswith(SUPABASE_UPLOAD_URI_PREFIX):
            parsed = urlparse(canonical)
            path = parsed.path or canonical
            if path.startswith("/uploads/files/"):
                return self._resolve_local_upload_url(canonical)
            return canonical

        object_path = canonical.removeprefix(SUPABASE_UPLOAD_URI_PREFIX)
        signed = self._create_signed_url(object_path=object_path, expires_in=expires_in)
        return signed or canonical

    def _resolve_local_upload_url(self, value: str) -> Optional[str]:
        """Return local upload URL only when the target file exists.

        Prevents stale avatar/image URLs from repeatedly returning 404 in UI.
        """
        cleaned = value.strip()
        if not cleaned:
            return None

        parsed = urlparse(cleaned)
        path = parsed.path or cleaned
        prefix = "/uploads/files/"
        if not path.startswith(prefix):
            return None

        relative = unquote(path[len(prefix):]).lstrip("/")
        if not relative:
            return None

        local_path = LOCAL_UPLOAD_ROOT / relative
        if not local_path.exists():
            return None

        # Keep original path/query if provided.
        if parsed.path:
            query = f"?{parsed.query}" if parsed.query else ""
            return f"{parsed.path}{query}"
        return cleaned

    def _create_signed_url(self, object_path: str, expires_in: int) -> Optional[str]:
        if not object_path:
            return None

        client = self.supabase
        if client is None:
            return None

        try:
            payload = client.storage.from_("uploads").create_signed_url(object_path, expires_in)
            signed = self._extract_url(payload, ("signedURL", "signedUrl", "signed_url", "url"))
            if signed:
                return signed
        except Exception:
            pass

        try:
            payload = client.storage.from_("uploads").get_public_url(object_path)
            signed = self._extract_url(payload, ("publicURL", "publicUrl", "public_url", "url"))
            if signed:
                return signed
        except Exception:
            pass
        return None

    def _extract_url(self, payload: object, keys: tuple[str, ...]) -> Optional[str]:
        if isinstance(payload, str):
            return self._to_absolute_supabase_url(payload)

        if not isinstance(payload, dict):
            return None

        for key in keys:
            value = payload.get(key)
            if isinstance(value, str) and value:
                return self._to_absolute_supabase_url(value)

        data = payload.get("data")
        if isinstance(data, dict):
            for key in keys:
                value = data.get(key)
                if isinstance(value, str) and value:
                    return self._to_absolute_supabase_url(value)
        return None

    def _to_absolute_supabase_url(self, value: str) -> Optional[str]:
        cleaned = value.strip()
        if not cleaned:
            return None
        if cleaned.startswith("http://") or cleaned.startswith("https://"):
            return cleaned
        if cleaned.startswith("/"):
            base = settings.SUPABASE_URL.rstrip("/")
            if not base:
                return None
            return f"{base}{cleaned}"
        return None

    def delete(self, storage_path: Optional[str]) -> None:
        if not storage_path:
            return

        if storage_path.startswith(SUPABASE_UPLOAD_URI_PREFIX):
            client = self.supabase
            if client is None:
                return

            object_path = storage_path.removeprefix(SUPABASE_UPLOAD_URI_PREFIX)
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
