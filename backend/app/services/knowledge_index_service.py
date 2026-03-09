from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import math
import re
from typing import Any, Iterable, Optional
from uuid import UUID

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.config import settings
from app.dependencies import RequestUser
from app.models.content_tag import ContentTag
from app.models.daily_log import DailyLog
from app.models.knowledge_chunk import KnowledgeChunk
from app.models.knowledge_document import KnowledgeDocument
from app.models.knowledge_feedback import KnowledgeFeedback
from app.models.knowledge_index_job import KnowledgeIndexJob
from app.models.knowledge_link import KnowledgeLink
from app.models.project_member import ProjectMember
from app.models.research_note import ResearchNote
from app.models.shared_post import SharedPost
from app.models.tag import Tag

try:
    from openai import OpenAI
except Exception:  # pragma: no cover - optional dependency in local env
    OpenAI = None

TOKEN_RE = re.compile(r"[0-9a-zA-Z가-힣]{2,}")
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?。！？])\s+")
STOPWORDS = {
    "the", "and", "for", "with", "this", "that", "from", "into", "have", "has", "had", "are", "was",
    "were", "will", "would", "about", "your", "you", "our", "their", "its", "not", "but", "can", "could",
    "to", "of", "in", "on", "at", "by", "or", "is", "be", "as", "it", "an", "a", "we", "they", "he", "she",
    "what", "which", "when", "where", "how", "why", "if", "then", "than", "there", "here",
    "그리고", "하지만", "또한", "에서", "으로", "에게", "하다", "있는", "없는", "대한", "관련", "및", "또는",
    "나는", "너는", "그는", "우리는", "입니다", "있다", "했다", "한다", "하기", "정리", "내용", "추가",
}

DEFAULT_EMBED_DIM = 192
MAX_SOURCE_TEXT_CHARS = 24000
MAX_RETRIEVE_DOCS = 700

_OPENAI_CLIENT: Any | None = None
_KIMI_CLIENT: Any | None = None
_PROVIDER_BACKOFF_UNTIL: dict[str, datetime] = {}


@dataclass
class SourcePayload:
    source_type: str
    source_id: UUID
    source_subtype: Optional[str]
    owner_user_id: UUID
    project_id: Optional[UUID]
    visibility_scope: str
    title: str
    text: str
    tags: list[str]
    meta: dict[str, Any]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _collect_text(node: Any, out: list[str], max_chunks: int = 240) -> None:
    if len(out) >= max_chunks:
        return

    if isinstance(node, str):
        cleaned = _normalize_text(node)
        if cleaned:
            out.append(cleaned[:900])
        return

    if isinstance(node, list):
        for item in node[:320]:
            _collect_text(item, out, max_chunks=max_chunks)
            if len(out) >= max_chunks:
                return
        return

    if isinstance(node, dict):
        for key in ("title", "text", "content", "body", "caption", "label", "name", "description"):
            value = node.get(key)
            if isinstance(value, str):
                cleaned = _normalize_text(value)
                if cleaned:
                    out.append(cleaned[:900])
                    if len(out) >= max_chunks:
                        return
        for value in node.values():
            if isinstance(value, (dict, list, str)):
                _collect_text(value, out, max_chunks=max_chunks)
                if len(out) >= max_chunks:
                    return


def extract_plain_text(content: Any) -> str:
    chunks: list[str] = []
    _collect_text(content, chunks)
    if not chunks:
        return ""
    text = _normalize_text(" ".join(chunks))
    return text[:MAX_SOURCE_TEXT_CHARS]


def tokenize(text: str) -> list[str]:
    tokens: list[str] = []
    seen: set[str] = set()
    for match in TOKEN_RE.finditer(text.lower()):
        token = match.group(0).lower()
        if token in STOPWORDS:
            continue
        if token in seen:
            continue
        seen.add(token)
        tokens.append(token)
        if len(tokens) >= 260:
            break
    return tokens


def summarize_text(text: str, max_chars: int = 360) -> str:
    cleaned = _normalize_text(text)
    if not cleaned:
        return ""
    sentences = SENTENCE_SPLIT_RE.split(cleaned)
    if not sentences:
        return cleaned[:max_chars]
    summary = ""
    for sentence in sentences:
        if not sentence:
            continue
        if len(summary) + len(sentence) + 1 > max_chars:
            break
        summary = f"{summary} {sentence}".strip()
    return summary or cleaned[:max_chars]


def keyword_candidates(title: str, text: str, tags: list[str], limit: int = 12) -> list[str]:
    counts = Counter(tokenize(f"{title} {text}"))
    for tag_name in tags:
        for token in tokenize(tag_name):
            counts[token] += 2
    ordered = [item for item, _ in counts.most_common(limit)]
    return ordered


def split_chunks(text: str, chunk_size: int, overlap: int) -> list[str]:
    cleaned = _normalize_text(text)
    if not cleaned:
        return []

    if len(cleaned) <= chunk_size:
        return [cleaned]

    chunks: list[str] = []
    start = 0
    text_len = len(cleaned)
    while start < text_len:
        end = min(text_len, start + chunk_size)
        if end < text_len:
            ws = cleaned.rfind(" ", start, end)
            if ws > start + int(chunk_size * 0.7):
                end = ws
        chunk = cleaned[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= text_len:
            break
        start = max(0, end - overlap)
        if len(chunks) >= 80:
            break
    return chunks


def _normalize_vector(values: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in values))
    if norm == 0:
        return values
    return [v / norm for v in values]


def _deterministic_embedding(text: str, dim: int = DEFAULT_EMBED_DIM) -> list[float]:
    vec = [0.0] * dim
    tokens = tokenize(text)[:220]
    if not tokens:
        return vec

    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        for i in range(0, min(8, dim)):
            idx = (digest[i] + (i * 17)) % dim
            sign = 1.0 if (digest[-1 - i] % 2 == 0) else -1.0
            vec[idx] += sign * (1.0 + ((digest[i] % 13) / 100.0))

    return _normalize_vector(vec)


def _get_openai_client() -> Any | None:
    global _OPENAI_CLIENT
    if _OPENAI_CLIENT is not None:
        return _OPENAI_CLIENT
    if not settings.OPENAI_API_KEY or OpenAI is None:
        return None
    try:
        _OPENAI_CLIENT = OpenAI(api_key=settings.OPENAI_API_KEY)
        return _OPENAI_CLIENT
    except Exception:
        return None


def _get_kimi_client() -> Any | None:
    global _KIMI_CLIENT
    if _KIMI_CLIENT is not None:
        return _KIMI_CLIENT
    if not settings.KIMI_API_KEY or OpenAI is None:
        return None
    try:
        kwargs: dict[str, Any] = {"api_key": settings.KIMI_API_KEY}
        base_url = (settings.KIMI_BASE_URL or "").strip()
        if base_url:
            kwargs["base_url"] = base_url
        _KIMI_CLIENT = OpenAI(**kwargs)
        return _KIMI_CLIENT
    except Exception:
        return None


def _embedding_provider_chain() -> list[str]:
    provider = (settings.KNOWLEDGE_EMBEDDING_PROVIDER or "auto").strip().lower()
    if provider == "auto":
        return ["openai", "kimi", "deterministic"]
    if provider in {"openai", "kimi", "deterministic"}:
        return [provider]
    return ["openai", "kimi", "deterministic"]


def _provider_available(provider: str) -> bool:
    until = _PROVIDER_BACKOFF_UNTIL.get(provider)
    if until is None:
        return True
    return _now() >= until


def _mark_provider_failure(provider: str, error_message: str) -> None:
    lowered = (error_message or "").lower()
    minutes = 3
    if "401" in lowered or "invalid authentication" in lowered:
        minutes = 60
    _PROVIDER_BACKOFF_UNTIL[provider] = _now() + timedelta(minutes=minutes)


def _mark_provider_success(provider: str) -> None:
    _PROVIDER_BACKOFF_UNTIL.pop(provider, None)


def _embed_with_client(provider: str, client: Any, model: str, texts: list[str]) -> Optional[list[list[float]]]:
    if not _provider_available(provider):
        return None
    if client is None or not model:
        return None
    try:
        response = client.embeddings.create(
            model=model,
            input=texts,
            timeout=8.0,
        )
        vectors: list[list[float]] = []
        for item in response.data:
            vector = [float(v) for v in item.embedding]
            vectors.append(_normalize_vector(vector))
        if len(vectors) == len(texts):
            _mark_provider_success(provider)
            return vectors
    except Exception as exc:
        _mark_provider_failure(provider, str(exc))
        return None
    return None


def current_embedding_backend() -> dict[str, Any]:
    for provider in _embedding_provider_chain():
        if provider == "openai":
            if (
                _provider_available("openai")
                and _get_openai_client() is not None
                and bool(settings.OPENAI_EMBEDDING_MODEL)
            ):
                return {
                    "provider": "openai",
                    "model": settings.OPENAI_EMBEDDING_MODEL,
                    "enabled": True,
                }
            continue
        if provider == "kimi":
            if (
                _provider_available("kimi")
                and _get_kimi_client() is not None
                and bool(settings.KIMI_EMBEDDING_MODEL)
            ):
                return {
                    "provider": "kimi",
                    "model": settings.KIMI_EMBEDDING_MODEL,
                    "enabled": True,
                }
            continue
        if provider == "deterministic":
            return {
                "provider": "deterministic",
                "model": "deterministic-hash-v1",
                "enabled": True,
            }

    return {
        "provider": "deterministic",
        "model": "deterministic-hash-v1",
        "enabled": True,
    }


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []

    for provider in _embedding_provider_chain():
        if provider == "openai":
            vectors = _embed_with_client("openai", _get_openai_client(), settings.OPENAI_EMBEDDING_MODEL, texts)
            if vectors is not None:
                return vectors
            continue
        if provider == "kimi":
            vectors = _embed_with_client("kimi", _get_kimi_client(), settings.KIMI_EMBEDDING_MODEL, texts)
            if vectors is not None:
                return vectors
            continue
        if provider == "deterministic":
            return [_deterministic_embedding(text) for text in texts]

    return [_deterministic_embedding(text) for text in texts]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    length = min(len(a), len(b))
    if length == 0:
        return 0.0
    return float(sum(a[i] * b[i] for i in range(length)))


def _resolve_tags(db: Session, source_type: str, source_id: UUID) -> list[str]:
    if source_type not in {"research_note", "shared_post"}:
        return []
    rows = (
        db.query(Tag.name)
        .join(ContentTag, ContentTag.tag_id == Tag.id)
        .filter(ContentTag.content_type == source_type, ContentTag.content_id == source_id)
        .all()
    )
    return [str(name) for (name,) in rows if isinstance(name, str)]


def _daily_log_title(log_date: Any, content: Any) -> str:
    if isinstance(content, dict):
        title = content.get("title")
        if isinstance(title, str) and title.strip():
            return title.strip()[:300]
    if log_date is not None:
        return f"Daily Log {log_date}"
    return "Daily Log"


def _build_source_payload(db: Session, source_type: str, source_id: UUID) -> tuple[Optional[SourcePayload], bool]:
    if source_type == "research_note":
        row = db.query(ResearchNote).filter(ResearchNote.id == source_id).first()
        if not row:
            return None, True
        if row.deleted_at is not None:
            return None, True
        text = extract_plain_text(row.content)
        tags = _resolve_tags(db, source_type, source_id)
        visibility = "project_shared" if row.project_id else "global_shared" if row.is_shared else "private"
        if not row.is_shared:
            visibility = "private"
        return (
            SourcePayload(
                source_type=source_type,
                source_id=source_id,
                source_subtype=None,
                owner_user_id=row.user_id,
                project_id=row.project_id,
                visibility_scope=visibility,
                title=(row.title or "Untitled Note")[:300],
                text=text,
                tags=tags,
                meta={"word_count": row.word_count, "reading_time": row.reading_time},
            ),
            False,
        )

    if source_type == "shared_post":
        row = db.query(SharedPost).filter(SharedPost.id == source_id).first()
        if not row:
            return None, True
        if row.deleted_at is not None:
            return None, True
        text = extract_plain_text(row.content)
        tags = _resolve_tags(db, source_type, source_id)
        visibility = "private" if row.visibility == "private" else ("project_shared" if row.project_id else "global_shared")
        return (
            SourcePayload(
                source_type=source_type,
                source_id=source_id,
                source_subtype=row.type,
                owner_user_id=row.user_id,
                project_id=row.project_id,
                visibility_scope=visibility,
                title=(row.title or "Untitled Shared Post")[:300],
                text=text,
                tags=tags,
                meta={"word_count": row.word_count, "reading_time": row.reading_time},
            ),
            False,
        )

    if source_type == "daily_log":
        row = db.query(DailyLog).filter(DailyLog.id == source_id).first()
        if not row:
            return None, True
        text = extract_plain_text(row.content)
        status = (row.status or "draft").lower()
        if status == "shared":
            visibility = "project_shared" if row.project_id else "private"
        else:
            visibility = "private"
        return (
            SourcePayload(
                source_type=source_type,
                source_id=source_id,
                source_subtype=status,
                owner_user_id=row.user_id,
                project_id=row.project_id,
                visibility_scope=visibility,
                title=_daily_log_title(row.log_date, row.content),
                text=text,
                tags=[],
                meta={"status": status, "log_date": row.log_date.isoformat() if row.log_date else None},
            ),
            False,
        )

    return None, True


def _document_hash(payload: SourcePayload, summary: str, keywords: list[str]) -> str:
    body = "|".join(
        [
            payload.source_type,
            str(payload.source_id),
            payload.title,
            payload.text,
            payload.visibility_scope,
            str(payload.project_id or ""),
            payload.source_subtype or "",
            summary,
            ",".join(keywords),
        ]
    )
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def _base_doc_embedding(db: Session, doc_id: UUID) -> list[float]:
    rows = (
        db.query(KnowledgeChunk.embedding)
        .filter(KnowledgeChunk.knowledge_document_id == doc_id)
        .order_by(KnowledgeChunk.chunk_index.asc())
        .limit(4)
        .all()
    )
    vectors: list[list[float]] = []
    for (embedding,) in rows:
        if isinstance(embedding, list) and embedding:
            try:
                vectors.append([float(v) for v in embedding])
            except Exception:
                continue
    if not vectors:
        return []

    dim = max(len(v) for v in vectors)
    agg = [0.0] * dim
    for vector in vectors:
        for i in range(min(dim, len(vector))):
            agg[i] += vector[i]
    return _normalize_vector(agg)


def _semantic_candidates_query(db: Session, document: KnowledgeDocument):
    q = db.query(KnowledgeDocument).filter(
        KnowledgeDocument.is_deleted.is_(False),
        KnowledgeDocument.id != document.id,
    )
    if document.project_id is not None:
        q = q.filter(
            or_(
                KnowledgeDocument.project_id == document.project_id,
                KnowledgeDocument.visibility_scope == "global_shared",
                KnowledgeDocument.owner_user_id == document.owner_user_id,
            )
        )
    else:
        q = q.filter(
            or_(
                KnowledgeDocument.project_id.is_(None),
                KnowledgeDocument.visibility_scope == "global_shared",
                KnowledgeDocument.owner_user_id == document.owner_user_id,
            )
        )
    return q.order_by(KnowledgeDocument.updated_at.desc()).limit(260)


def _rebuild_semantic_links(db: Session, document: KnowledgeDocument) -> int:
    db.query(KnowledgeLink).filter(
        KnowledgeLink.link_type == "semantic_similarity",
        or_(
            KnowledgeLink.from_document_id == document.id,
            KnowledgeLink.to_document_id == document.id,
        ),
    ).delete(synchronize_session=False)
    db.flush()

    source_vec = _base_doc_embedding(db, document.id)
    if not source_vec:
        return 0

    candidates = _semantic_candidates_query(db, document).all()
    if not candidates:
        return 0

    created = 0
    min_score = max(0.1, min(float(settings.KNOWLEDGE_SEMANTIC_LINK_MIN_SCORE), 0.98))
    embedding_backend = current_embedding_backend()
    for candidate in candidates:
        target_vec = _base_doc_embedding(db, candidate.id)
        if not target_vec:
            continue
        score = cosine_similarity(source_vec, target_vec)
        if score < min_score:
            continue

        left, right = (
            (document.id, candidate.id)
            if str(document.id) <= str(candidate.id)
            else (candidate.id, document.id)
        )
        db.add(
            KnowledgeLink(
                from_document_id=left,
                to_document_id=right,
                link_type="semantic_similarity",
                score=float(round(score, 4)),
                evidence={
                    "source": "knowledge_embedding",
                    "provider": embedding_backend.get("provider"),
                    "model": embedding_backend.get("model"),
                },
            )
        )
        created += 1

    db.flush()
    return created


def _mark_deleted(db: Session, source_type: str, source_id: UUID) -> int:
    row = (
        db.query(KnowledgeDocument)
        .filter(KnowledgeDocument.source_type == source_type, KnowledgeDocument.source_id == source_id)
        .first()
    )
    if not row:
        return 0

    row.is_deleted = True
    row.last_indexed_at = _now()
    db.query(KnowledgeChunk).filter(KnowledgeChunk.knowledge_document_id == row.id).delete(synchronize_session=False)
    db.query(KnowledgeLink).filter(
        or_(KnowledgeLink.from_document_id == row.id, KnowledgeLink.to_document_id == row.id)
    ).delete(synchronize_session=False)
    db.flush()
    return 1


def _open_index_job(db: Session, source_type: str, source_id: UUID, job_type: str) -> KnowledgeIndexJob:
    job = KnowledgeIndexJob(
        source_type=source_type,
        source_id=source_id,
        job_type=job_type,
        status="running",
        attempts=1,
        scheduled_at=_now(),
    )
    db.add(job)
    db.flush()
    return job


def _finish_job(db: Session, job: KnowledgeIndexJob, status: str, error_message: Optional[str] = None) -> None:
    job.status = status
    job.error_message = (error_message or None)
    job.finished_at = _now()
    db.add(job)


def upsert_document_index(db: Session, source_type: str, source_id: UUID) -> dict[str, Any]:
    job = _open_index_job(db, source_type=source_type, source_id=source_id, job_type="upsert")
    try:
        payload, deleted = _build_source_payload(db, source_type=source_type, source_id=source_id)
        if deleted or payload is None:
            deleted_count = _mark_deleted(db, source_type=source_type, source_id=source_id)
            _finish_job(db, job, status="done")
            db.commit()
            return {
                "status": "deleted",
                "deleted_documents": deleted_count,
            }

        keywords = keyword_candidates(payload.title, payload.text, payload.tags, limit=14)
        summary = summarize_text(payload.text)
        content_hash = _document_hash(payload, summary=summary, keywords=keywords)

        document = (
            db.query(KnowledgeDocument)
            .filter(KnowledgeDocument.source_type == source_type, KnowledgeDocument.source_id == source_id)
            .first()
        )

        unchanged = False
        if document is None:
            document = KnowledgeDocument(
                source_type=source_type,
                source_id=source_id,
                owner_user_id=payload.owner_user_id,
                project_id=payload.project_id,
            )
            db.add(document)
        else:
            unchanged = document.content_hash == content_hash and not document.is_deleted

        document.source_subtype = payload.source_subtype
        document.owner_user_id = payload.owner_user_id
        document.project_id = payload.project_id
        document.visibility_scope = payload.visibility_scope
        document.title = payload.title
        document.summary = summary
        document.keywords = keywords
        document.content_hash = content_hash
        document.meta_json = payload.meta
        document.last_indexed_at = _now()
        document.is_deleted = False
        db.add(document)
        db.flush()

        if unchanged:
            _finish_job(db, job, status="done")
            db.commit()
            return {
                "status": "unchanged",
                "document_id": str(document.id),
                "chunks": 0,
                "links": 0,
            }

        chunk_size = max(500, int(settings.KNOWLEDGE_INDEX_CHUNK_SIZE))
        overlap = max(80, min(int(settings.KNOWLEDGE_INDEX_CHUNK_OVERLAP), int(chunk_size * 0.5)))
        chunks = split_chunks(payload.text, chunk_size=chunk_size, overlap=overlap)
        if not chunks:
            chunks = [payload.title]
        vectors = embed_texts(chunks)

        db.query(KnowledgeChunk).filter(KnowledgeChunk.knowledge_document_id == document.id).delete(synchronize_session=False)
        for idx, chunk_text in enumerate(chunks):
            embedding = vectors[idx] if idx < len(vectors) else _deterministic_embedding(chunk_text)
            db.add(
                KnowledgeChunk(
                    knowledge_document_id=document.id,
                    chunk_index=idx,
                    text_content=chunk_text,
                    token_estimate=max(1, int(len(chunk_text) / 4)),
                    embedding=embedding,
                    keyword_blob=" ".join(tokenize(chunk_text)),
                )
            )
        db.flush()

        link_count = _rebuild_semantic_links(db, document)

        _finish_job(db, job, status="done")
        db.commit()
        return {
            "status": "indexed",
            "document_id": str(document.id),
            "chunks": len(chunks),
            "links": link_count,
            "keywords": keywords,
        }
    except Exception as exc:
        db.rollback()
        try:
            db.add(job)
            _finish_job(db, job, status="failed", error_message=str(exc)[:500])
            db.commit()
        except Exception:
            db.rollback()
        raise


def delete_document_index(db: Session, source_type: str, source_id: UUID) -> dict[str, Any]:
    job = _open_index_job(db, source_type=source_type, source_id=source_id, job_type="delete")
    try:
        deleted_count = _mark_deleted(db, source_type=source_type, source_id=source_id)
        _finish_job(db, job, status="done")
        db.commit()
        return {"status": "deleted", "deleted_documents": deleted_count}
    except Exception as exc:
        db.rollback()
        try:
            db.add(job)
            _finish_job(db, job, status="failed", error_message=str(exc)[:500])
            db.commit()
        except Exception:
            db.rollback()
        raise


def _allowed_docs_query(db: Session, current_user: RequestUser, project_id: Optional[UUID]):
    q = db.query(KnowledgeDocument).filter(KnowledgeDocument.is_deleted.is_(False))

    if current_user.role == "admin":
        if project_id is not None:
            q = q.filter(
                or_(
                    KnowledgeDocument.project_id == project_id,
                    KnowledgeDocument.visibility_scope == "global_shared",
                )
            )
        return q

    membership_project_ids = {
        pid
        for (pid,) in db.query(ProjectMember.project_id)
        .filter(ProjectMember.user_id == current_user.id)
        .all()
    }

    visibility_filter = or_(
        KnowledgeDocument.owner_user_id == current_user.id,
        KnowledgeDocument.visibility_scope == "global_shared",
        and_(
            KnowledgeDocument.visibility_scope == "project_shared",
            KnowledgeDocument.project_id.in_(list(membership_project_ids)) if membership_project_ids else False,
        ),
    )
    q = q.filter(visibility_filter)

    if project_id is not None:
        q = q.filter(
            or_(
                KnowledgeDocument.project_id == project_id,
                KnowledgeDocument.visibility_scope == "global_shared",
                KnowledgeDocument.owner_user_id == current_user.id,
            )
        )

    return q


def _doc_keyword_score(query_tokens: set[str], title: str, summary: str, keywords: list[str]) -> float:
    if not query_tokens:
        return 0.0
    score = 0.0

    keyword_set = {k.lower() for k in keywords}
    overlap = len(query_tokens.intersection(keyword_set))
    if overlap:
        score += min(0.72, overlap * 0.18)

    haystack = f"{title} {summary}".lower()
    for token in query_tokens:
        if token in haystack:
            score += 0.11

    return min(1.0, score)


def _resolve_doc_url(source_type: str, source_id: UUID, source_subtype: Optional[str], meta_json: dict[str, Any]) -> str:
    if source_type == "research_note":
        return f"/research-notes/{source_id}"
    if source_type == "shared_post":
        if source_subtype in {"kanban", "insight"}:
            return f"/shared/feed/{source_id}"
        return f"/shared/articles/{source_id}"
    if source_type == "daily_log":
        log_date = meta_json.get("log_date")
        if isinstance(log_date, str) and log_date:
            return f"/daily-log/{log_date}"
        return "/daily-log/archive"
    return "/home"


def retrieve_knowledge(
    db: Session,
    *,
    current_user: RequestUser,
    query: str,
    project_id: Optional[UUID] = None,
    source_types: Optional[set[str]] = None,
    top_k: Optional[int] = None,
) -> list[dict[str, Any]]:
    query_text = _normalize_text(query)
    if not query_text:
        return []

    q_docs = _allowed_docs_query(db, current_user=current_user, project_id=project_id)
    if source_types:
        q_docs = q_docs.filter(KnowledgeDocument.source_type.in_(list(source_types)))

    docs = (
        q_docs.order_by(KnowledgeDocument.updated_at.desc())
        .limit(MAX_RETRIEVE_DOCS)
        .all()
    )
    if not docs:
        return []

    doc_ids = [doc.id for doc in docs]
    chunks = (
        db.query(KnowledgeChunk)
        .filter(KnowledgeChunk.knowledge_document_id.in_(doc_ids))
        .order_by(KnowledgeChunk.knowledge_document_id.asc(), KnowledgeChunk.chunk_index.asc())
        .all()
    )
    chunks_by_doc: dict[UUID, list[KnowledgeChunk]] = {}
    for chunk in chunks:
        chunks_by_doc.setdefault(chunk.knowledge_document_id, []).append(chunk)

    query_embedding = embed_texts([query_text])[0]
    query_tokens = set(tokenize(query_text))

    ranked: list[dict[str, Any]] = []
    for doc in docs:
        doc_chunks = chunks_by_doc.get(doc.id, [])
        semantic_score = 0.0
        best_snippet = doc.summary or ""
        for chunk in doc_chunks[:12]:
            embedding = chunk.embedding
            if isinstance(embedding, list) and embedding:
                try:
                    vec = [float(v) for v in embedding]
                    semantic_score = max(semantic_score, max(0.0, cosine_similarity(query_embedding, vec)))
                except Exception:
                    pass
            if not best_snippet and chunk.text_content:
                best_snippet = chunk.text_content[:240]

        keywords = doc.keywords if isinstance(doc.keywords, list) else []
        keyword_score = _doc_keyword_score(
            query_tokens=query_tokens,
            title=doc.title or "",
            summary=doc.summary or "",
            keywords=[str(k) for k in keywords],
        )
        if semantic_score == 0 and keyword_score == 0:
            continue

        score = (keyword_score * 0.42) + (semantic_score * 0.58)
        if keyword_score > semantic_score + 0.08:
            match_reason = "keyword"
        elif semantic_score > keyword_score + 0.08:
            match_reason = "semantic"
        else:
            match_reason = "hybrid"

        ranked.append(
            {
                "knowledge_document_id": str(doc.id),
                "source_type": doc.source_type,
                "source_id": str(doc.source_id),
                "source_subtype": doc.source_subtype,
                "title": doc.title,
                "summary": doc.summary or "",
                "snippet": (best_snippet or "")[:260],
                "keywords": [str(k) for k in keywords][:12],
                "project_id": str(doc.project_id) if doc.project_id else None,
                "visibility_scope": doc.visibility_scope,
                "score": round(score, 4),
                "semantic_score": round(semantic_score, 4),
                "keyword_score": round(keyword_score, 4),
                "match_reason": match_reason,
                "url": _resolve_doc_url(
                    source_type=doc.source_type,
                    source_id=doc.source_id,
                    source_subtype=doc.source_subtype,
                    meta_json=doc.meta_json if isinstance(doc.meta_json, dict) else {},
                ),
                "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
            }
        )

    ranked.sort(key=lambda row: (row["score"], row["updated_at"] or ""), reverse=True)
    limit = max(1, min(top_k or settings.KNOWLEDGE_INDEX_TOP_K, 20))
    return ranked[:limit]


def record_feedback(
    db: Session,
    *,
    current_user: RequestUser,
    project_id: Optional[UUID],
    query_text: str,
    target_source_type: str,
    target_source_id: UUID,
    feedback_type: str,
    relevance_score: Optional[int],
) -> KnowledgeFeedback:
    row = KnowledgeFeedback(
        user_id=current_user.id,
        project_id=project_id,
        query_text=query_text[:1200],
        target_source_type=target_source_type,
        target_source_id=target_source_id,
        feedback_type=feedback_type,
        relevance_score=relevance_score,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_health_summary(db: Session) -> dict[str, Any]:
    now = _now()
    window = now - timedelta(hours=24)

    total_docs = db.query(func.count(KnowledgeDocument.id)).scalar() or 0
    active_docs = (
        db.query(func.count(KnowledgeDocument.id))
        .filter(KnowledgeDocument.is_deleted.is_(False))
        .scalar()
        or 0
    )
    total_chunks = db.query(func.count(KnowledgeChunk.id)).scalar() or 0
    total_links = db.query(func.count(KnowledgeLink.id)).scalar() or 0

    queued_jobs = (
        db.query(func.count(KnowledgeIndexJob.id))
        .filter(KnowledgeIndexJob.status.in_(["queued", "running"]))
        .scalar()
        or 0
    )
    failed_24h = (
        db.query(func.count(KnowledgeIndexJob.id))
        .filter(KnowledgeIndexJob.status == "failed", KnowledgeIndexJob.created_at >= window)
        .scalar()
        or 0
    )
    feedback_24h = (
        db.query(func.count(KnowledgeFeedback.id))
        .filter(KnowledgeFeedback.created_at >= window)
        .scalar()
        or 0
    )
    last_indexed_at = db.query(func.max(KnowledgeDocument.last_indexed_at)).scalar()
    embedding_backend = current_embedding_backend()

    return {
        "documents_total": int(total_docs),
        "documents_active": int(active_docs),
        "chunks_total": int(total_chunks),
        "links_total": int(total_links),
        "jobs_queued_or_running": int(queued_jobs),
        "jobs_failed_24h": int(failed_24h),
        "feedback_events_24h": int(feedback_24h),
        "last_indexed_at": last_indexed_at.isoformat() if isinstance(last_indexed_at, datetime) else None,
        "embedding_provider": embedding_backend.get("provider"),
        "embedding_model": embedding_backend.get("model"),
        "embedding_enabled": bool(embedding_backend.get("enabled")),
        "openai_enabled": bool(settings.OPENAI_API_KEY),
        "kimi_enabled": bool(settings.KIMI_API_KEY),
    }


def reindex_recent_sources(db: Session, *, days: int = 2, limit: int = 1200) -> dict[str, Any]:
    since = _now() - timedelta(days=max(1, days))
    scheduled: list[tuple[str, UUID]] = []

    recent_notes = (
        db.query(ResearchNote.id)
        .filter(ResearchNote.deleted_at.is_(None), func.coalesce(ResearchNote.updated_at, ResearchNote.created_at) >= since)
        .order_by(ResearchNote.updated_at.desc())
        .limit(limit)
        .all()
    )
    scheduled.extend(("research_note", row_id) for (row_id,) in recent_notes)

    remaining = max(0, limit - len(scheduled))
    if remaining > 0:
        recent_posts = (
            db.query(SharedPost.id)
            .filter(SharedPost.deleted_at.is_(None), func.coalesce(SharedPost.updated_at, SharedPost.created_at) >= since)
            .order_by(SharedPost.updated_at.desc())
            .limit(remaining)
            .all()
        )
        scheduled.extend(("shared_post", row_id) for (row_id,) in recent_posts)

    remaining = max(0, limit - len(scheduled))
    if remaining > 0:
        recent_logs = (
            db.query(DailyLog.id)
            .filter(func.coalesce(DailyLog.updated_at, DailyLog.created_at) >= since)
            .order_by(DailyLog.updated_at.desc())
            .limit(remaining)
            .all()
        )
        scheduled.extend(("daily_log", row_id) for (row_id,) in recent_logs)

    indexed = 0
    failed = 0
    for source_type, source_id in scheduled:
        try:
            upsert_document_index(db, source_type=source_type, source_id=source_id)
            indexed += 1
        except Exception:
            failed += 1

    return {
        "scheduled": len(scheduled),
        "indexed": indexed,
        "failed": failed,
        "window_days": days,
    }
