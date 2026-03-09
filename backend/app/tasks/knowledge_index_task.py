from __future__ import annotations

from typing import Any
from uuid import UUID

from app.celery_config import celery_app
from app.database import SessionLocal
from app.services.knowledge_index_service import (
    delete_document_index,
    reindex_recent_sources,
    upsert_document_index,
)


@celery_app.task(name="app.tasks.knowledge_index_task.run_knowledge_index_upsert")
def run_knowledge_index_upsert(source_type: str, source_id: str) -> dict[str, Any]:
    db = SessionLocal()
    try:
        parsed_id = UUID(str(source_id))
        return upsert_document_index(db, source_type=source_type, source_id=parsed_id)
    finally:
        db.close()


@celery_app.task(name="app.tasks.knowledge_index_task.run_knowledge_index_delete")
def run_knowledge_index_delete(source_type: str, source_id: str) -> dict[str, Any]:
    db = SessionLocal()
    try:
        parsed_id = UUID(str(source_id))
        return delete_document_index(db, source_type=source_type, source_id=parsed_id)
    finally:
        db.close()


@celery_app.task(name="app.tasks.knowledge_index_task.run_knowledge_nightly_reindex")
def run_knowledge_nightly_reindex(days: int = 2, limit: int = 1200) -> dict[str, Any]:
    db = SessionLocal()
    try:
        return reindex_recent_sources(db, days=days, limit=limit)
    finally:
        db.close()


def queue_upsert(source_type: str, source_id: UUID) -> None:
    run_knowledge_index_upsert.delay(source_type=source_type, source_id=str(source_id))


def queue_delete(source_type: str, source_id: UUID) -> None:
    run_knowledge_index_delete.delay(source_type=source_type, source_id=str(source_id))
