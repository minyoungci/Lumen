from __future__ import annotations

import uuid
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user
from app.models.project import Project
from app.models.project_member import ProjectMember

router = APIRouter()


# --------------------------------------------------------------------------- #
# Schemas (inline — no separate schemas file needed for now)
# --------------------------------------------------------------------------- #

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


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
        db.commit()
        db.refresh(project)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {"data": _project_to_dict(project), "message": "Created"}


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

    data = []
    for p in projects:
        d = _project_to_dict(p)
        d["my_role"] = member_role_map.get(p.id)
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
    d = _project_to_dict(project, members=members)
    d["my_role"] = member.role
    return {"data": d}


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
