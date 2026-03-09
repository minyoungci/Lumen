from datetime import timedelta

from celery import Celery
from app.config import settings

def create_celery_app() -> Celery:
    celery_app = Celery(
        "lumen",
        broker=settings.REDIS_URL,
        backend=settings.REDIS_URL,
        include=[
            "app.tasks.daily_summary_task",
            "app.tasks.storage_integrity_task",
            "app.tasks.knowledge_index_task",
        ],
    )

    integrity_interval_hours = max(1, int(settings.STORAGE_INTEGRITY_CHECK_INTERVAL_HOURS))
    celery_app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="Asia/Seoul",
        enable_utc=True,
        task_acks_late=True,
        worker_prefetch_multiplier=1,
        task_routes={
            "app.tasks.daily_summary_task.*": {"queue": "ai_tasks"},
            "app.tasks.storage_integrity_task.*": {"queue": "maintenance_tasks"},
            "app.tasks.knowledge_index_task.*": {"queue": "ai_tasks"},
        },
        beat_schedule={
            "storage-integrity-check": {
                "task": "app.tasks.storage_integrity_task.run_storage_integrity_check",
                "schedule": timedelta(hours=integrity_interval_hours),
                "options": {"queue": "maintenance_tasks"},
            },
            "knowledge-nightly-reindex": {
                "task": "app.tasks.knowledge_index_task.run_knowledge_nightly_reindex",
                "schedule": timedelta(hours=24),
                "options": {"queue": "ai_tasks"},
            },
        },
    )

    return celery_app

celery_app = create_celery_app()
