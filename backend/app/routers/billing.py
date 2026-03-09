from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import RequestUser, get_current_user

router = APIRouter()


class CheckoutRequest(BaseModel):
    plan_id: str = Field(pattern="^(pro|team)$")


PLANS = [
    {
        "id": "free",
        "name": "Free",
        "price_monthly_krw": 0,
        "features": [
            "개인 노트/로그",
            "기본 검색",
            "최대 1 프로젝트",
        ],
    },
    {
        "id": "pro",
        "name": "Pro",
        "price_monthly_krw": 19000,
        "features": [
            "무제한 개인/팀 프로젝트",
            "고급 검색/그래프",
            "우선 지원",
        ],
    },
    {
        "id": "team",
        "name": "Team",
        "price_monthly_krw": 79000,
        "features": [
            "팀 워크스페이스 관리",
            "관리자 리포트",
            "맞춤 온보딩",
        ],
    },
]


def _manual_checkout_url(plan_id: str) -> str:
    subject = quote(f"LabBase {plan_id.upper()} 플랜 문의")
    body = quote("회사명/사용 인원/필요 기능을 적어주세요.")
    return f"mailto:{settings.CONTACT_SALES_EMAIL}?subject={subject}&body={body}"


@router.get("/plans", response_model=dict)
def list_plans(
    _: RequestUser = Depends(get_current_user),
):
    return {
        "data": {
            "billing_enabled": settings.BILLING_ENABLED,
            "provider": settings.BILLING_PROVIDER,
            "plans": PLANS,
        }
    }


@router.post("/checkout", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_checkout_session(
    payload: CheckoutRequest,
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    _ = db  # reserved for billing audit table in next step
    _ = current_user

    if payload.plan_id == "pro":
        checkout_url = settings.CHECKOUT_URL_PRO.strip() or _manual_checkout_url("pro")
    elif payload.plan_id == "team":
        checkout_url = settings.CHECKOUT_URL_TEAM.strip() or _manual_checkout_url("team")
    else:
        raise HTTPException(status_code=400, detail="invalid plan")

    return {
        "data": {
            "plan_id": payload.plan_id,
            "checkout_url": checkout_url,
            "mode": "live" if settings.BILLING_ENABLED else "manual",
        },
        "message": "Checkout session created",
    }
