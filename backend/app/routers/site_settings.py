from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user
from app.models.site_setting import SiteSetting
from app.utils.site_config import ensure_site_config

router = APIRouter()
SITE_SETTINGS_SCOPE = "global"


def _ensure_site_settings_row(db: Session) -> SiteSetting:
    row = db.query(SiteSetting).filter(SiteSetting.scope == SITE_SETTINGS_SCOPE).first()
    if row:
        return row

    defaults = ensure_site_config({})
    row = SiteSetting(
        scope=SITE_SETTINGS_SCOPE,
        published_config=defaults,
        draft_config=defaults,
        published_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("", response_model=dict)
def get_site_settings(
    db: Session = Depends(get_db),
    _: RequestUser = Depends(get_current_user),
):
    row = _ensure_site_settings_row(db)
    config = ensure_site_config(row.published_config)
    return {
        "data": {
            "config": config,
            "published_at": row.published_at.isoformat() if row.published_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
    }
