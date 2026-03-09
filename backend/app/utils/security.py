from __future__ import annotations

from functools import lru_cache
from typing import Optional, Set

from app.config import settings


def normalize_email(email: Optional[str]) -> str:
    if not isinstance(email, str):
        return ""
    return email.strip().lower()


@lru_cache(maxsize=1)
def get_admin_email_allowlist() -> Set[str]:
    raw = settings.ADMIN_EMAIL_ALLOWLIST or ""
    parsed = {normalize_email(item) for item in raw.split(",") if normalize_email(item)}
    if parsed:
        return parsed
    return {"dbssus123@gmail.com"}


def is_admin_email(email: Optional[str]) -> bool:
    return normalize_email(email) in get_admin_email_allowlist()
