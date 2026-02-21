from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user, require_admin
from app.models.user import UserProfile

router = APIRouter()


class InviteRequest(BaseModel):
    email: str
    display_name: str
    role: Literal["admin", "member"] = "member"


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
            "avatar_url": user.avatar_url,
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
    # TODO: wire with Supabase Admin API (auth.admin.invite_user_by_email)
    return {
        "data": {
            "invited": True,
            "email": payload.email,
            "display_name": payload.display_name,
            "role": payload.role,
        },
        "message": "Invitation queued (stub)",
    }
