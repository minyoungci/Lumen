from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user
from app.models.project import Project
from app.models.project_invite_code import ProjectInviteCode
from app.models.project_member import ProjectMember
from app.models.user import UserProfile
from app.utils.profile import resolve_avatar_url, resolve_member_color

router = APIRouter()

INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
INVITE_CODE_LENGTH = 8


# --------------------------------------------------------------------------- #
# Schemas (inline — no separate schemas file needed for now)
# --------------------------------------------------------------------------- #

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class InviteCodeIssue(BaseModel):
    expires_in_hours: Optional[int] = Field(default=24 * 14, ge=1, le=24 * 365)
    usage_limit: Optional[int] = Field(default=None, ge=1, le=10000)
    deactivate_existing: bool = True


class JoinByCodePayload(BaseModel):
    code: str


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _get_member(db: Session, project_id: UUID, user_id: UUID) -> Optional[ProjectMember]:
    return (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )


def _require_owner(db: Session, project_id: UUID, user_id: UUID) -> ProjectMember:
    member = _get_member(db, project_id, user_id)
    if not member or member.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner role required")
    return member


def _project_to_dict(project: Project, members: list[ProjectMember] | None = None) -> dict:
    d = {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "invite_token": project.invite_token,
        "created_by_id": project.created_by_id,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
    }
    if members is not None:
        d["members"] = [
            {
                "id": m.id,
                "user_id": m.user_id,
                "role": m.role,
                "joined_at": m.joined_at,
            }
            for m in members
        ]
    return d


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _is_expired(expires_at: Optional[datetime]) -> bool:
    if expires_at is None:
        return False
    compare_target = expires_at
    if compare_target.tzinfo is None:
        compare_target = compare_target.replace(tzinfo=timezone.utc)
    return compare_target <= _now_utc()


def _invite_code_status(row: ProjectInviteCode) -> str:
    if not row.is_active:
        return "inactive"
    if _is_expired(row.expires_at):
        return "expired"
    if row.usage_limit is not None and (row.usage_count or 0) >= row.usage_limit:
        return "exhausted"
    return "active"


def _invite_code_to_dict(row: ProjectInviteCode) -> dict:
    status_value = _invite_code_status(row)
    return {
        "id": str(row.id),
        "project_id": str(row.project_id),
        "code": row.code,
        "status": status_value,
        "is_active": row.is_active,
        "usage_count": int(row.usage_count or 0),
        "usage_limit": row.usage_limit,
        "expires_at": row.expires_at.isoformat() if row.expires_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "join_path": f"/join/code/{row.code}",
    }


def _generate_unique_invite_code(db: Session) -> str:
    for _ in range(24):
        code = "".join(secrets.choice(INVITE_CODE_ALPHABET) for _ in range(INVITE_CODE_LENGTH))
        exists = db.query(ProjectInviteCode.id).filter(ProjectInviteCode.code == code).first()
        if not exists:
            return code
    raise HTTPException(status_code=500, detail="Failed to generate invite code")


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #

@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    project = Project(
        name=payload.name,
        description=payload.description,
        invite_token=uuid.uuid4().hex,
        created_by_id=current_user.id,
    )
    try:
        db.add(project)
        db.flush()  # get project.id before adding member

        member = ProjectMember(
            project_id=project.id,
            user_id=current_user.id,
            role="owner",
        )
        db.add(member)

        initial_code = ProjectInviteCode(
            project_id=project.id,
            code=_generate_unique_invite_code(db),
            created_by_id=current_user.id,
            is_active=True,
            expires_at=_now_utc() + timedelta(days=14),
        )
        db.add(initial_code)

        db.commit()
        db.refresh(project)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    data = _project_to_dict(project)
    data["active_invite_code"] = _invite_code_to_dict(initial_code)
    return {"data": data, "message": "Created"}


@router.get("", response_model=dict)
def list_projects(
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    member_rows = (
        db.query(ProjectMember)
        .filter(ProjectMember.user_id == current_user.id)
        .all()
    )
    project_ids = [m.project_id for m in member_rows]
    member_role_map = {m.project_id: m.role for m in member_rows}

    if not project_ids:
        return {"data": []}

    projects = db.query(Project).filter(Project.id.in_(project_ids)).all()
    member_rows_all = db.query(ProjectMember).filter(ProjectMember.project_id.in_(project_ids)).all()
    member_count_map: dict[UUID, int] = {}
    for row in member_rows_all:
        member_count_map[row.project_id] = member_count_map.get(row.project_id, 0) + 1

    data = []
    for p in projects:
        d = _project_to_dict(p)
        my_role = member_role_map.get(p.id)
        d["my_role"] = my_role
        d["role"] = my_role
        d["member_count"] = member_count_map.get(p.id, 0)
        data.append(d)

    return {"data": data}


@router.get("/{project_id}", response_model=dict)
def get_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    member = _get_member(db, project_id, current_user.id)
    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this project")

    members = db.query(ProjectMember).filter(ProjectMember.project_id == project_id).all()
    user_ids = [m.user_id for m in members]
    profiles = db.query(UserProfile).filter(UserProfile.id.in_(user_ids)).all()
    profile_map = {
        p.id: {
            "display_name": p.display_name,
            "avatar_url": resolve_avatar_url(p.avatar_url),
            "member_color": resolve_member_color(p.id, p.preferences),
            "status_message": (p.preferences or {}).get("status_message"),
            "pronouns": (p.preferences or {}).get("pronouns"),
        }
        for p in profiles
    }

    d = _project_to_dict(project)
    d["members"] = [
        {
            "user_id": str(m.user_id),
            "display_name": profile_map.get(m.user_id, {}).get("display_name", "Unknown"),
            "avatar_url": profile_map.get(m.user_id, {}).get("avatar_url"),
            "member_color": profile_map.get(m.user_id, {}).get("member_color"),
            "status_message": profile_map.get(m.user_id, {}).get("status_message"),
            "pronouns": profile_map.get(m.user_id, {}).get("pronouns"),
            "role": m.role,
            "joined_at": m.joined_at.isoformat() if m.joined_at else None,
        }
        for m in members
    ]
    d["my_role"] = member.role
    d["role"] = member.role

    if member.role == "owner":
        active_code = (
            db.query(ProjectInviteCode)
            .filter(
                ProjectInviteCode.project_id == project_id,
                ProjectInviteCode.is_active.is_(True),
            )
            .order_by(ProjectInviteCode.created_at.desc())
            .first()
        )
        if active_code:
            d["active_invite_code"] = _invite_code_to_dict(active_code)

    return {"data": d}


@router.post("/join/code", response_model=dict)
def join_project_by_code(
    payload: JoinByCodePayload,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    normalized_code = payload.code.strip().upper()
    if not normalized_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite code is required")

    invite_code = db.query(ProjectInviteCode).filter(ProjectInviteCode.code == normalized_code).first()
    if not invite_code:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invite code")

    status_value = _invite_code_status(invite_code)
    if status_value == "inactive":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite code is inactive")
    if status_value == "expired":
        invite_code.is_active = False
        db.add(invite_code)
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite code has expired")
    if status_value == "exhausted":
        invite_code.is_active = False
        db.add(invite_code)
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite code has been exhausted")

    project = db.query(Project).filter(Project.id == invite_code.project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    existing = _get_member(db, project.id, current_user.id)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member of this project")

    member = ProjectMember(
        project_id=project.id,
        user_id=current_user.id,
        role="member",
    )

    invite_code.usage_count = int(invite_code.usage_count or 0) + 1
    if invite_code.usage_limit is not None and invite_code.usage_count >= invite_code.usage_limit:
        invite_code.is_active = False

    try:
        db.add(member)
        db.add(invite_code)
        db.commit()
        db.refresh(project)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {"data": _project_to_dict(project), "message": "Joined project"}


@router.post("/join/{token}", response_model=dict)
def join_project(
    token: str,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.invite_token == token).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invite token")

    existing = _get_member(db, project.id, current_user.id)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member of this project")

    member = ProjectMember(
        project_id=project.id,
        user_id=current_user.id,
        role="member",
    )
    try:
        db.add(member)
        db.commit()
        db.refresh(project)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {"data": _project_to_dict(project), "message": "Joined project"}


@router.post("/{project_id}/invite/regenerate", response_model=dict)
def regenerate_invite_token(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    _require_owner(db, project_id, current_user.id)

    project.invite_token = uuid.uuid4().hex
    try:
        db.add(project)
        db.commit()
        db.refresh(project)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {"data": {"invite_token": project.invite_token}, "message": "Invite token regenerated"}


@router.get("/{project_id}/invite-codes", response_model=dict)
def list_invite_codes(
    project_id: UUID,
    active_only: bool = Query(default=False),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    _require_owner(db, project_id, current_user.id)

    q = db.query(ProjectInviteCode).filter(ProjectInviteCode.project_id == project_id)
    if active_only:
        q = q.filter(ProjectInviteCode.is_active.is_(True))

    rows = q.order_by(ProjectInviteCode.created_at.desc()).limit(limit).all()
    return {"data": [_invite_code_to_dict(row) for row in rows]}


@router.post("/{project_id}/invite-codes", response_model=dict, status_code=status.HTTP_201_CREATED)
def issue_invite_code(
    project_id: UUID,
    payload: InviteCodeIssue,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    _require_owner(db, project_id, current_user.id)

    if payload.deactivate_existing:
        (
            db.query(ProjectInviteCode)
            .filter(
                ProjectInviteCode.project_id == project_id,
                ProjectInviteCode.is_active.is_(True),
            )
            .update({ProjectInviteCode.is_active: False}, synchronize_session=False)
        )

    expires_at = (
        _now_utc() + timedelta(hours=payload.expires_in_hours)
        if payload.expires_in_hours
        else None
    )

    row = ProjectInviteCode(
        project_id=project_id,
        code=_generate_unique_invite_code(db),
        created_by_id=current_user.id,
        usage_limit=payload.usage_limit,
        expires_at=expires_at,
        is_active=True,
    )

    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {
        "data": _invite_code_to_dict(row),
        "message": "Invite code issued",
    }


@router.post("/{project_id}/invite-codes/{invite_code_id}/deactivate", response_model=dict)
def deactivate_invite_code(
    project_id: UUID,
    invite_code_id: UUID,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    _require_owner(db, project_id, current_user.id)

    row = (
        db.query(ProjectInviteCode)
        .filter(
            ProjectInviteCode.id == invite_code_id,
            ProjectInviteCode.project_id == project_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite code not found")

    row.is_active = False

    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {"data": _invite_code_to_dict(row), "message": "Invite code deactivated"}


@router.delete("/{project_id}/members/{member_user_id}", response_model=dict)
def remove_member(
    project_id: UUID,
    member_user_id: UUID,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    _require_owner(db, project_id, current_user.id)

    if member_user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Owner cannot remove themselves")

    target = _get_member(db, project_id, member_user_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    try:
        db.delete(target)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {"message": "Member removed"}
