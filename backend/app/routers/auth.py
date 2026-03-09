from __future__ import annotations

import json
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import RequestUser, get_current_user, require_admin
from app.models.project import Project
from app.models.project_invite_code import ProjectInviteCode
from app.models.project_member import ProjectMember
from app.models.user import UserProfile
from app.utils.profile import resolve_avatar_url
from app.utils.security import is_admin_email

router = APIRouter()


class InviteRequest(BaseModel):
    email: str
    display_name: str
    role: Literal["admin", "member"] = "member"
    redirect_to: str | None = None


class DirectSignupRequest(BaseModel):
    email: str
    password: str
    display_name: str | None = None
    invite_code: str | None = None
    invite_token: str | None = None


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _is_expired(expires_at: datetime | None) -> bool:
    if expires_at is None:
        return False
    target = expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=timezone.utc)
    return target <= _now_utc()


def _supabase_admin_request(method: str, path: str, payload: dict | None = None) -> dict:
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase admin integration is not configured",
        )

    base = settings.SUPABASE_URL.rstrip("/")
    url = f"{base}{path}"
    headers = {
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
    }
    body: bytes | None = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(url, data=body, headers=headers, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="ignore")
        detail = None
        try:
            parsed = json.loads(raw)
            detail = parsed.get("msg") or parsed.get("message") or parsed.get("error_description") or parsed.get("error")
        except Exception:
            detail = None

        text = str(detail or raw or f"Supabase admin request failed ({exc.code})")
        lower = text.lower()
        if "already" in lower and "register" in lower:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 등록된 이메일입니다.") from exc
        if "already_registered" in lower or "email_exists" in lower:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 등록된 이메일입니다.") from exc
        if exc.code in {409}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=text) from exc
        if exc.code in {400, 401, 403, 404, 422}:
            raise HTTPException(status_code=exc.code, detail=text) from exc
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=text) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Supabase admin request failed: {exc}",
        ) from exc


def _supabase_admin_create_user(email: str, password: str, display_name: str) -> UUID:
    response = _supabase_admin_request(
        "POST",
        "/auth/v1/admin/users",
        {
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {
                "display_name": display_name,
                "role": "member",
            },
        },
    )
    user_id = response.get("id")
    if not user_id and isinstance(response.get("user"), dict):
        user_id = response["user"].get("id")
    if not user_id:
        raise HTTPException(status_code=502, detail="Failed to create user account")
    try:
        return UUID(str(user_id))
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Invalid user id from auth provider") from exc


def _supabase_admin_delete_user(user_id: UUID) -> None:
    try:
        _supabase_admin_request("DELETE", f"/auth/v1/admin/users/{user_id}")
    except Exception:
        return


@router.post("/signup", response_model=dict, status_code=status.HTTP_201_CREATED)
def direct_signup(
    payload: DirectSignupRequest,
    db: Session = Depends(get_db),
):
    email = (payload.email or "").strip().lower()
    password = payload.password or ""
    display_name = (payload.display_name or email.split("@")[0] if email else "User").strip()
    invite_code = (payload.invite_code or "").strip().upper()
    invite_token = (payload.invite_token or "").strip()

    if not email or "@" not in email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="유효한 이메일을 입력해주세요.")
    if len(password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="비밀번호는 8자 이상이어야 합니다.")
    if not display_name:
        display_name = "User"
    display_name = display_name[:100]

    if bool(invite_code) == bool(invite_token):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="유효한 초대 코드 또는 초대 토큰이 필요합니다.",
        )

    project: Project | None = None
    invite_row: ProjectInviteCode | None = None

    if invite_code:
        invite_row = db.query(ProjectInviteCode).filter(ProjectInviteCode.code == invite_code).first()
        if not invite_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invite code")
        if not invite_row.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite code is inactive")
        if _is_expired(invite_row.expires_at):
            invite_row.is_active = False
            db.add(invite_row)
            db.commit()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite code has expired")
        if invite_row.usage_limit is not None and int(invite_row.usage_count or 0) >= invite_row.usage_limit:
            invite_row.is_active = False
            db.add(invite_row)
            db.commit()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite code has been exhausted")
        project = db.query(Project).filter(Project.id == invite_row.project_id).first()
    else:
        project = db.query(Project).filter(Project.invite_token == invite_token).first()

    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    user_id = _supabase_admin_create_user(email=email, password=password, display_name=display_name)

    try:
        profile = db.query(UserProfile).filter(UserProfile.id == user_id).first()
        if profile is None:
            profile = UserProfile(
                id=user_id,
                display_name=display_name,
                role="member",
                is_active=True,
            )
            db.add(profile)
        else:
            profile.display_name = display_name or profile.display_name
            profile.role = "member"
            profile.is_active = True
            db.add(profile)

        existing_member = (
            db.query(ProjectMember)
            .filter(ProjectMember.project_id == project.id, ProjectMember.user_id == user_id)
            .first()
        )
        if existing_member is None:
            db.add(ProjectMember(project_id=project.id, user_id=user_id, role="member"))

        if invite_row is not None:
            invite_row.usage_count = int(invite_row.usage_count or 0) + 1
            if invite_row.usage_limit is not None and invite_row.usage_count >= invite_row.usage_limit:
                invite_row.is_active = False
            db.add(invite_row)

        db.commit()
    except Exception:
        db.rollback()
        _supabase_admin_delete_user(user_id)
        raise HTTPException(status_code=500, detail="회원가입 처리 중 오류가 발생했습니다.")

    return {
        "data": {
            "user_id": str(user_id),
            "project_id": str(project.id),
            "joined": True,
        },
        "message": "Signup complete",
    }


@router.post("/verify", response_model=dict)
def verify_token(
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    user = db.query(UserProfile).filter(UserProfile.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found")

    return {
        "data": {
            "id": user.id,
            "email": None,
            "display_name": user.display_name,
            "avatar_url": resolve_avatar_url(user.avatar_url),
            "role": user.role,
            "is_active": user.is_active,
            "created_at": user.created_at,
        }
    }


@router.post("/invite", response_model=dict, status_code=status.HTTP_201_CREATED)
def invite_user(
    payload: InviteRequest,
    _: RequestUser = Depends(require_admin),
):
    if payload.role == "admin" and not is_admin_email(payload.email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin invite is restricted to allowlisted email accounts only",
        )

    try:
        invite_payload = {
            "email": payload.email,
            "data": {
                "display_name": payload.display_name,
                "role": payload.role,
            },
        }
        if payload.redirect_to:
            invite_payload["redirect_to"] = payload.redirect_to
        _supabase_admin_request("POST", "/auth/v1/invite", invite_payload)
    except HTTPException as exc:
        raise exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to invite user: {exc}",
        ) from exc

    return {
        "data": {
            "invited": True,
            "email": payload.email,
            "display_name": payload.display_name,
            "role": payload.role,
        },
        "message": "Invitation sent",
    }
