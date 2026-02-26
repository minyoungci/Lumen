from __future__ import annotations

import json
import urllib.request
import urllib.error
from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import UserProfile
from app.utils.security import is_admin_email


@dataclass
class RequestUser:
    id: UUID
    role: str


def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None

    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None

    token = parts[1].strip()
    return token or None


def _parse_bearer_uuid(authorization: Optional[str]) -> Optional[UUID]:
    """Development helper: allow Bearer <uuid> or Bearer dev:<uuid>."""
    token = _extract_bearer_token(authorization)
    if not token:
        return None

    if token.startswith("dev:"):
        token = token[4:]

    try:
        return UUID(token)
    except ValueError:
        return None


def _resolve_supabase_user(token: str, db: Session) -> Optional[RequestUser]:
    """Verify JWT via Supabase /auth/v1/user REST endpoint (no Python client needed)."""
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        return None

    url = f"{settings.SUPABASE_URL}/auth/v1/user"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError:
        return None
    except Exception:
        return None

    user_id_str = data.get("id", "")
    try:
        user_id = UUID(str(user_id_str))
    except (ValueError, AttributeError):
        return None

    app_meta = data.get("app_metadata") or {}
    user_meta = data.get("user_metadata") or {}
    email = data.get("email")

    app_role = app_meta.get("role")
    role = app_role if app_role in {"admin", "member"} else "member"
    if is_admin_email(email):
        role = "admin"
    elif role == "admin":
        role = "member"

    display_name = (
        user_meta.get("display_name")
        or user_meta.get("name")
        or (email.split("@")[0] if isinstance(email, str) and "@" in email else "User")
    )

    try:
        user = db.query(UserProfile).filter(UserProfile.id == user_id).first()
        if user is None:
            user = UserProfile(
                id=user_id,
                display_name=display_name,
                role=role,
                is_active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            # Keep profile role aligned with trusted auth app_metadata.
            if role in {"admin", "member"} and user.role != role:
                user.role = role
                db.add(user)
                db.commit()
                db.refresh(user)

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User is inactive",
            )

        # Use auth UUID (user_id) directly — it matches ForeignKey("auth.users.id")
        # stored in all models (research_notes.user_id, daily_logs.user_id, etc.)
        # user.id (UserProfile PK) may differ if profile was created outside Supabase path
        return RequestUser(id=user_id, role=user.role or role)
    except HTTPException:
        raise
    except Exception:
        return None



def get_current_user(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    x_user_role: Optional[str] = Header(default=None, alias="X-User-Role"),
) -> RequestUser:
    """Auth resolver.

    Production path (DEV_BYPASS_AUTH=false):
    - Requires Authorization Bearer token verified via Supabase.

    Dev path (DEV_BYPASS_AUTH=true):
    - Accepts X-User-Id or Bearer <uuid>/dev:<uuid>
    - If a non-UUID Bearer token is provided, tries Supabase verification first
    """

    bearer_token = _extract_bearer_token(authorization)

    # 1) Production mode: strict Supabase token verification
    if not settings.DEV_BYPASS_AUTH:
        if not bearer_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authorization Bearer token required",
            )

        resolved = _resolve_supabase_user(bearer_token, db)
        if resolved is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or unverifiable access token",
            )

        return resolved

    # 2) Dev mode: try Supabase token first when token looks like JWT
    if bearer_token and _parse_bearer_uuid(authorization) is None:
        resolved = _resolve_supabase_user(bearer_token, db)
        if resolved is not None:
            if x_user_role == "member":
                resolved.role = x_user_role
            elif x_user_role == "admin" and resolved.role == "admin":
                resolved.role = "admin"
            return resolved

    user_uuid: Optional[UUID] = None

    if x_user_id:
        try:
            user_uuid = UUID(x_user_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid X-User-Id header",
            ) from exc

    if user_uuid is None:
        user_uuid = _parse_bearer_uuid(authorization)

    if user_uuid is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No user context found. Set X-User-Id or use Bearer dev:<uuid>.",
        )

    user = db.query(UserProfile).filter(UserProfile.id == user_uuid).first()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive dev user context.",
        )

    role = user.role or "member"
    if x_user_role == "member":
        role = "member"
    elif x_user_role == "admin" and role == "admin":
        role = "admin"
    return RequestUser(id=user.id, role=role)



def require_admin(current_user: RequestUser = Depends(get_current_user)) -> RequestUser:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )
    return current_user
