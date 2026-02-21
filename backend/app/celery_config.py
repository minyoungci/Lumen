from celery import Celery
from app.config import settings

def create_celery_app() -> Celery:
    celery_app = Celery(
        "lumen",
        broker=settings.REDIS_URL,
        backend=settings.REDIS_URL,
        include=["app.tasks.daily_summary_task"]
    )
    
    celery_app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="Asia/Seoul",
        enable_utc=True,
        task_acks_late=True,
        worker_prefetch_multiplier=1,
        task_routes={
            "app.tasks.daily_summary_task.*": {"queue": "ai_tasks"}
        }
    )
    
    return celery_app

celery_app = create_celery_app()
