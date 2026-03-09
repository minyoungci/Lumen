from __future__ import annotations

import json
import logging
from typing import Any

import redis

from app.celery_config import celery_app
from app.config import settings
from app.database import SessionLocal
from app.models.notification import Notification
from app.models.user import UserProfile
from app.routers.admin import _build_storage_integrity_report, _repair_storage_integrity_internal

logger = logging.getLogger(__name__)

LOCK_KEY = "lumen:storage_integrity:lock"
ALERT_SIGNATURE_KEY = "lumen:storage_integrity:last_alert_signature"


def _redis_client() -> redis.Redis | None:
    try:
        return redis.from_url(settings.REDIS_URL)
    except Exception:
        return None


def _should_alert(report: dict[str, Any]) -> bool:
    uploads = report.get("uploads") if isinstance(report, dict) else {}
    shared_media = report.get("shared_media") if isinstance(report, dict) else {}
    missing_both = int(uploads.get("missing_in_both", 0) or 0)
    shared_missing = int(shared_media.get("missing_paths", 0) or 0)
    return missing_both > 0 or shared_missing > 0


def _alert_signature(report: dict[str, Any], repair_result: dict[str, Any]) -> str:
    uploads = report.get("uploads") if isinstance(report, dict) else {}
    shared_media = report.get("shared_media") if isinstance(report, dict) else {}
    payload = {
        "missing_in_supabase": int(uploads.get("missing_in_supabase", 0) or 0),
        "missing_in_local_backup": int(uploads.get("missing_in_local_backup", 0) or 0),
        "missing_in_both": int(uploads.get("missing_in_both", 0) or 0),
        "shared_missing_paths": int(shared_media.get("missing_paths", 0) or 0),
        "failed_repairs": len(repair_result.get("failed_repairs", []) or []),
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def _notify_admins(db, report: dict[str, Any], repair_result: dict[str, Any]) -> int:
    uploads = report.get("uploads") if isinstance(report, dict) else {}
    shared_media = report.get("shared_media") if isinstance(report, dict) else {}
    missing_supabase = int(uploads.get("missing_in_supabase", 0) or 0)
    missing_local = int(uploads.get("missing_in_local_backup", 0) or 0)
    missing_both = int(uploads.get("missing_in_both", 0) or 0)
    shared_missing = int(shared_media.get("missing_paths", 0) or 0)
    repaired_supabase = int(repair_result.get("repaired_supabase_objects", 0) or 0)
    repaired_local = int(repair_result.get("repaired_local_backups", 0) or 0)

    body = (
        f"무결성 점검 결과: supabase 누락 {missing_supabase}, "
        f"로컬 누락 {missing_local}, 양쪽 누락 {missing_both}, "
        f"shared media 누락 {shared_missing}. "
        f"자동 복구: supabase {repaired_supabase}, 로컬 {repaired_local}."
    )

    admin_ids = [
        user_id
        for (user_id,) in db.query(UserProfile.id)
        .filter(UserProfile.role == "admin", UserProfile.is_active.is_(True))
        .all()
    ]
    for admin_id in admin_ids:
        db.add(
            Notification(
                user_id=admin_id,
                type="storage_integrity_alert",
                title="스토리지 무결성 이상 감지",
                body=body[:300],
                link="/admin",
                is_read=False,
                actor_id=None,
            )
        )

    if admin_ids:
        db.commit()
    return len(admin_ids)


@celery_app.task(name="app.tasks.storage_integrity_task.run_storage_integrity_check")
def run_storage_integrity_check() -> dict[str, Any]:
    redis_client = _redis_client()
    lock_acquired = False

    if redis_client is not None:
        try:
            lock_acquired = bool(
                redis_client.set(
                    LOCK_KEY,
                    "1",
                    nx=True,
                    ex=max(60, int(settings.STORAGE_INTEGRITY_LOCK_TTL_SECONDS)),
                )
            )
        except Exception:
            lock_acquired = False
        if not lock_acquired:
            return {"ok": True, "skipped": True, "reason": "another_run_in_progress"}

    db = SessionLocal()
    try:
        upload_limit = max(1, int(settings.STORAGE_INTEGRITY_UPLOAD_SCAN_LIMIT))
        shared_post_limit = max(1, int(settings.STORAGE_INTEGRITY_SHARED_SCAN_LIMIT))

        before_report = _build_storage_integrity_report(
            db=db,
            upload_limit=upload_limit,
            shared_post_limit=shared_post_limit,
        )

        repair_result = _repair_storage_integrity_internal(
            db=db,
            upload_limit=upload_limit,
            shared_post_limit=shared_post_limit,
        )
        after_report = repair_result.get("integrity_after", before_report)

        alerted = 0
        if _should_alert(after_report):
            signature = _alert_signature(after_report, repair_result)
            should_send = True
            if redis_client is not None:
                try:
                    last_signature = redis_client.get(ALERT_SIGNATURE_KEY)
                    decoded = (
                        last_signature.decode("utf-8")
                        if isinstance(last_signature, (bytes, bytearray))
                        else str(last_signature or "")
                    )
                    should_send = decoded != signature
                    if should_send:
                        redis_client.set(
                            ALERT_SIGNATURE_KEY,
                            signature,
                            ex=max(300, int(settings.STORAGE_INTEGRITY_ALERT_DEDUP_HOURS) * 3600),
                        )
                except Exception:
                    should_send = True
            if should_send:
                alerted = _notify_admins(db, after_report, repair_result)

        return {
            "ok": True,
            "skipped": False,
            "alerted_admins": alerted,
            "integrity_before": before_report,
            "repair": repair_result,
        }
    except Exception as exc:
        logger.exception("storage integrity periodic task failed: %s", exc)
        return {"ok": False, "error": str(exc)}
    finally:
        db.close()
        if redis_client is not None and lock_acquired:
            try:
                redis_client.delete(LOCK_KEY)
            except Exception:
                pass

