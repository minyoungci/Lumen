from __future__ import annotations

from pathlib import Path
from typing import Optional, Tuple

from fastapi import HTTPException

# 40MB: API/nginx/client 공통 상한. multipart 오버헤드를 고려해 proxy는 여유치 사용.
MAX_FILE_SIZE = 40 * 1024 * 1024
VALID_FILE_TYPES = {"image", "code", "document", "other"}

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

ALLOWED_IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".bmp",
    ".tif",
    ".tiff",
    ".avif",
    ".heic",
    ".heif",
}

IMAGE_MIME_BY_EXTENSION = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".avif": "image/avif",
    ".heic": "image/heic",
    ".heif": "image/heif",
}

HEIF_FAMILY_BRANDS = {
    b"avif",
    b"avis",
    b"heic",
    b"heix",
    b"hevc",
    b"hevx",
    b"mif1",
    b"msf1",
}


def extension(name: str) -> str:
    suffix = Path(name).suffix.strip().lower()
    if not suffix:
        return ""
    return suffix if suffix.startswith(".") else f".{suffix}"


def normalize_content_type(content_type: Optional[str]) -> str:
    return (content_type or "application/octet-stream").split(";")[0].strip().lower()


def ensure_within_size_limit(content: bytes, max_size: int = MAX_FILE_SIZE) -> None:
    if len(content) > max_size:
        raise HTTPException(status_code=413, detail=f"File too large (max {max_size // (1024 * 1024)}MB)")


def _is_supported_image_extension(name: str) -> bool:
    return extension(name) in ALLOWED_IMAGE_EXTENSIONS


def _detect_image_mime(content: bytes) -> Optional[str]:
    if not content:
        return None
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if content.startswith(b"BM"):
        return "image/bmp"
    if content.startswith((b"II*\x00", b"MM\x00*")):
        return "image/tiff"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    if len(content) >= 12 and content[4:8] == b"ftyp":
        brand = content[8:12]
        if brand in HEIF_FAMILY_BRANDS:
            if brand in {b"avif", b"avis"}:
                return "image/avif"
            if brand in {b"heic", b"heix", b"hevc", b"hevx"}:
                return "image/heic"
            return "image/heif"
    return None


def _resolve_image_content_type(content_type: str, filename: str, content: bytes) -> Optional[str]:
    detected = _detect_image_mime(content)
    ext = extension(filename)

    if content_type.startswith("image/"):
        if detected:
            return detected
        if _is_supported_image_extension(filename):
            return IMAGE_MIME_BY_EXTENSION.get(ext, content_type)
        return None

    if content_type == "application/octet-stream":
        if detected:
            return detected
        if _is_supported_image_extension(filename):
            return IMAGE_MIME_BY_EXTENSION.get(ext)
        return None

    return None


def resolve_upload_content_type(
    file_type: str,
    filename: str,
    content_type: Optional[str],
    content: bytes,
) -> Tuple[str, str]:
    normalized_file_type = (file_type or "").strip().lower()
    if normalized_file_type not in VALID_FILE_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file_type")

    normalized_content_type = normalize_content_type(content_type)
    resolved_content_type = normalized_content_type

    if normalized_file_type == "image":
        resolved_content_type = _resolve_image_content_type(
            normalized_content_type,
            filename,
            content,
        ) or ""
        if not resolved_content_type:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported image file type. MIME={normalized_content_type}",
            )
        return normalized_file_type, resolved_content_type

    allowed = ALLOWED_BY_TYPE.get(normalized_file_type)
    if normalized_file_type != "other" and allowed is not None and resolved_content_type not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file MIME type: {normalized_content_type}")

    return normalized_file_type, resolved_content_type
