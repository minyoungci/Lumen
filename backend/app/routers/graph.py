from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
import re
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user
from app.models.content_tag import ContentTag
from app.models.knowledge_document import KnowledgeDocument
from app.models.knowledge_link import KnowledgeLink
from app.models.project import Project
from app.models.research_note import ResearchNote
from app.models.shared_post import SharedPost
from app.models.tag import Tag
from app.services.knowledge_index_service import current_embedding_backend

router = APIRouter()

TOKEN_RE = re.compile(r"[0-9a-zA-Z가-힣]{2,}")
STOPWORDS = {
    "the", "and", "for", "with", "this", "that", "from", "into", "have", "has", "had", "are", "was",
    "were", "will", "would", "about", "your", "you", "our", "their", "its", "not", "but", "can", "could",
    "to", "of", "in", "on", "at", "by", "or", "is", "be", "as", "it", "an", "a", "we", "they", "he", "she",
    "what", "which", "when", "where", "how", "why", "if", "then", "than", "there", "here",
    "그리고", "하지만", "또한", "에서", "으로", "에게", "하다", "있는", "없는", "에서", "대한", "관련", "및", "또는",
    "나는", "너는", "그는", "우리는", "입니다", "있다", "했다", "한다", "하기", "하기로", "정리", "내용", "추가",
}

MAX_PAIR_CANDIDATES_PER_TOKEN = 60
MAX_PAIR_CANDIDATES_PER_GROUP = 40


EDGE_WEIGHTS = {
    "has_tag": 0.95,
    "same_author": 0.30,
    "same_project": 0.22,
}

EDGE_POLICIES = {"hybrid", "tag_ai", "tag_only", "ai_only"}

REASON_PRIORITY = [
    "semantic_similarity",
    "has_tag",
    "shared_tag",
    "text_similarity",
    "same_author",
    "same_project",
]


def _verify_project_access(
    db: Session,
    project_id: Optional[UUID],
    current_user: RequestUser,
) -> None:
    if project_id is None:
        return

    project_exists = db.query(Project.id).filter(Project.id == project_id).first()
    if not project_exists:
        raise HTTPException(status_code=404, detail="Project not found")

    if current_user.role == "admin":
        return

    from app.models.project_member import ProjectMember

    member = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == current_user.id,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this project")


def _to_timestamp(value: Optional[datetime]) -> float:
    if value is None:
        return 0.0
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.timestamp()


def _collect_text(node: Any, out: list[str], max_chunks: int = 80) -> None:
    if len(out) >= max_chunks:
        return

    if isinstance(node, str):
        text = node.strip()
        if text:
            out.append(text[:500])
        return

    if isinstance(node, list):
        for item in node[:140]:
            _collect_text(item, out, max_chunks=max_chunks)
            if len(out) >= max_chunks:
                return
        return

    if isinstance(node, dict):
        for key in ("title", "text", "content", "body", "caption", "label", "name", "description"):
            value = node.get(key)
            if isinstance(value, str) and value.strip():
                out.append(value.strip()[:500])
                if len(out) >= max_chunks:
                    return

        for value in node.values():
            if isinstance(value, (dict, list)):
                _collect_text(value, out, max_chunks=max_chunks)
                if len(out) >= max_chunks:
                    return
            elif isinstance(value, str) and value.strip():
                out.append(value.strip()[:500])
                if len(out) >= max_chunks:
                    return


def _tokenize(label: str, content: Any) -> set[str]:
    chunks: list[str] = []
    if isinstance(label, str) and label.strip():
        chunks.append(label.strip())
    _collect_text(content, chunks)

    if not chunks:
        return set()

    text = " ".join(chunks).lower()
    tokens: list[str] = []
    seen: set[str] = set()

    for match in TOKEN_RE.finditer(text):
        token = match.group(0).lower()
        if token in STOPWORDS:
            continue
        if token in seen:
            continue
        seen.add(token)
        tokens.append(token)
        if len(tokens) >= 180:
            break

    return set(tokens)


def _jaccard_score(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a.intersection(b))
    if inter == 0:
        return 0.0
    union = len(a.union(b))
    if union == 0:
        return 0.0
    return inter / union


def _edge_key(source_id: str, target_id: str) -> tuple[str, str]:
    if source_id < target_id:
        return source_id, target_id
    return target_id, source_id


def _add_edge(
    edge_map: dict[tuple[str, str], dict[str, Any]],
    source_id: str,
    target_id: str,
    reason: str,
    weight: float,
) -> None:
    if source_id == target_id:
        return
    if weight <= 0.0:
        return

    key = _edge_key(source_id, target_id)
    existing = edge_map.get(key)
    if existing is None:
        edge_map[key] = {
            "source": key[0],
            "target": key[1],
            "type": "hybrid",
            "weight": min(1.0, weight),
            "reasons": {reason},
        }
        return

    existing["weight"] = min(1.0, float(existing["weight"]) + weight)
    existing["reasons"].add(reason)


def _primary_reason(reasons: list[str]) -> str:
    reason_set = set(reasons)
    for reason in REASON_PRIORITY:
        if reason in reason_set:
            return reason
    return reasons[0] if reasons else "unknown"


def _style_hint(reasons: list[str]) -> str:
    reason_set = set(reasons)
    if "semantic_similarity" in reason_set:
        return "semantic"
    if "has_tag" in reason_set or "shared_tag" in reason_set:
        return "tag"
    return "contextual"


def _compute_centrality_map(node_ids: set[str], edges: list[dict[str, Any]]) -> dict[str, float]:
    if not node_ids:
        return {}

    weighted_degree: dict[str, float] = defaultdict(float)
    for edge in edges:
        source = str(edge.get("source"))
        target = str(edge.get("target"))
        if source not in node_ids or target not in node_ids:
            continue
        weight = float(edge.get("weight") or 0.0)
        if weight <= 0.0:
            continue
        weighted_degree[source] += weight
        weighted_degree[target] += weight

    max_degree = max(weighted_degree.values(), default=0.0)
    if max_degree <= 0:
        return {node_id: 0.0 for node_id in node_ids}

    return {
        node_id: round(float(weighted_degree.get(node_id, 0.0) / max_degree), 4)
        for node_id in node_ids
    }


def _cluster_map_from_edges(
    node_ids: set[str],
    edges: list[dict[str, Any]],
    *,
    min_cluster_edge_weight: float = 0.4,
) -> tuple[dict[str, Optional[str]], int, Optional[str]]:
    if not node_ids:
        return {}, 0, None

    adjacency: dict[str, set[str]] = {node_id: set() for node_id in node_ids}
    for edge in edges:
        source = str(edge.get("source"))
        target = str(edge.get("target"))
        if source not in adjacency or target not in adjacency:
            continue
        weight = float(edge.get("weight") or 0.0)
        if weight < min_cluster_edge_weight:
            continue
        adjacency[source].add(target)
        adjacency[target].add(source)

    visited: set[str] = set()
    components: list[list[str]] = []
    for start in sorted(node_ids):
        if start in visited:
            continue
        queue = [start]
        visited.add(start)
        component: list[str] = []
        while queue:
            current = queue.pop()
            component.append(current)
            for nxt in adjacency[current]:
                if nxt in visited:
                    continue
                visited.add(nxt)
                queue.append(nxt)
        components.append(component)

    components.sort(key=len, reverse=True)
    mapping: dict[str, Optional[str]] = {}
    dominant_cluster_id: Optional[str] = None
    cluster_count = 0
    for idx, component in enumerate(components, start=1):
        if len(component) < 2:
            for node_id in component:
                mapping[node_id] = None
            continue
        cluster_id = f"cluster_{idx}"
        if dominant_cluster_id is None:
            dominant_cluster_id = cluster_id
        cluster_count += 1
        for node_id in component:
            mapping[node_id] = cluster_id

    return mapping, cluster_count, dominant_cluster_id


def _graph_density_score(node_count: int, edge_count: int) -> float:
    if node_count <= 1:
        return 0.0
    possible = node_count * (node_count - 1) / 2
    if possible <= 0:
        return 0.0
    density = float(edge_count / possible)
    return round(max(0.0, min(1.0, density)), 4)


def _apply_node_scores(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    centrality_map: Optional[dict[str, float]] = None,
) -> None:
    degree_map: dict[str, int] = defaultdict(int)
    for edge in edges:
        source = edge["source"]
        target = edge["target"]
        degree_map[source] += 1
        degree_map[target] += 1

    now_ts = datetime.now(timezone.utc).timestamp()
    for node in nodes:
        node_id = str(node["id"])
        node_type = str(node.get("type") or "")

        base = 0.58 if node_type in {"research_note", "shared_post"} else 0.36
        recency_boost = 0.0
        centrality = float((centrality_map or {}).get(node_id, 0.0))

        updated_at = node.get("updated_at")
        if isinstance(updated_at, datetime):
            age_days = max(0.0, (now_ts - _to_timestamp(updated_at)) / 86400.0)
            recency_boost = max(0.0, 1.0 - (age_days / 120.0))

        degree_boost = min(0.35, degree_map.get(node_id, 0) * 0.03)
        centrality_boost = min(0.28, centrality * 0.28)

        if node_type == "tag":
            importance = min(1.0, 0.30 + (degree_boost * 1.15) + centrality_boost)
        else:
            importance = min(1.0, base + (recency_boost * 0.23) + degree_boost + centrality_boost)

        node["importance"] = round(float(importance), 4)
        node["centrality"] = round(float(centrality), 4)
        node["size"] = round(3.5 + (importance * 8.0), 2)


@router.get("", response_model=dict)
def get_graph(
    content_type: Optional[str] = Query(default=None),
    user_id: Optional[UUID] = Query(default=None),
    tag: Optional[str] = Query(default=None),
    project_id: Optional[UUID] = Query(default=None),
    limit_nodes: int = Query(default=450, ge=120, le=1200),
    min_weight: float = Query(default=0.28, ge=0.05, le=1.0),
    include_text_similarity: bool = Query(default=True),
    include_knowledge_edges: bool = Query(default=True),
    knowledge_min_score: float = Query(default=0.35, ge=0.1, le=1.0),
    edge_policy: str = Query(default="tag_ai"),
    expand_level: int = Query(default=1, ge=1, le=3),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    _verify_project_access(db, project_id, current_user)

    requested_types = {"research_note", "shared_post", "tag"}
    if content_type:
        requested_types = {s.strip() for s in content_type.split(",") if s.strip()}

    policy = str(edge_policy or "tag_ai").strip().lower()
    if policy not in EDGE_POLICIES:
        raise HTTPException(status_code=400, detail="edge_policy must be one of hybrid, tag_ai, tag_only, ai_only")

    allow_tag_edges = policy in {"hybrid", "tag_ai", "tag_only"}
    allow_ai_edges = policy in {"hybrid", "tag_ai", "ai_only"}
    allow_context_edges = policy == "hybrid"
    allow_text_similarity = include_text_similarity and policy == "hybrid"
    embedding_backend = current_embedding_backend()

    expand_factor = {1: 1.0, 2: 1.8, 3: 2.6}[expand_level]
    source_limit = max(200, int(limit_nodes * expand_factor))

    note_q = db.query(ResearchNote).filter(ResearchNote.deleted_at.is_(None))
    post_q = db.query(SharedPost).filter(SharedPost.deleted_at.is_(None))

    if user_id:
        note_q = note_q.filter(ResearchNote.user_id == user_id)
        post_q = post_q.filter(SharedPost.user_id == user_id)

    if project_id is not None:
        note_q = note_q.filter(ResearchNote.project_id == project_id)
        post_q = post_q.filter(SharedPost.project_id == project_id)
    else:
        note_q = note_q.filter(ResearchNote.project_id.is_(None))
        post_q = post_q.filter(SharedPost.project_id.is_(None))

    if current_user.role != "admin":
        note_q = note_q.filter(
            or_(
                ResearchNote.user_id == current_user.id,
                ResearchNote.is_shared.is_(True),
            )
        )
        post_q = post_q.filter(
            or_(
                SharedPost.visibility == "shared",
                SharedPost.user_id == current_user.id,
            )
        )

    notes = (
        note_q.order_by(ResearchNote.updated_at.desc(), ResearchNote.created_at.desc()).limit(source_limit).all()
        if "research_note" in requested_types
        else []
    )
    posts = (
        post_q.order_by(SharedPost.updated_at.desc(), SharedPost.created_at.desc()).limit(source_limit).all()
        if "shared_post" in requested_types
        else []
    )

    note_ids = {row.id for row in notes}
    post_ids = {row.id for row in posts}

    if not note_ids and not post_ids and not tag:
        return {
            "data": {
                "nodes": [],
                "edges": [],
                "meta": {
                    "total_nodes_before_trim": 0,
                    "total_edges_before_trim": 0,
                    "truncated": False,
                    "applied_limit_nodes": limit_nodes,
                    "applied_min_weight": round(float(min_weight), 3),
                    "applied_knowledge_min_score": round(float(knowledge_min_score), 3),
                    "applied_edge_policy": policy,
                    "embedding_provider": embedding_backend.get("provider"),
                    "embedding_model": embedding_backend.get("model"),
                    "embedding_enabled": bool(embedding_backend.get("enabled")),
                    "cluster_count": 0,
                    "dominant_cluster_id": None,
                    "density_score": 0.0,
                },
            }
        }

    content_tag_filters = []
    if note_ids:
        content_tag_filters.append(
            and_(ContentTag.content_type == "research_note", ContentTag.content_id.in_(list(note_ids)))
        )
    if post_ids:
        content_tag_filters.append(
            and_(ContentTag.content_type == "shared_post", ContentTag.content_id.in_(list(post_ids)))
        )

    content_tags = (
        db.query(ContentTag).filter(or_(*content_tag_filters)).all()
        if content_tag_filters
        else []
    )

    target_tag_id: Optional[UUID] = None
    if tag:
        target_tag = db.query(Tag).filter(Tag.slug == tag).first()
        if not target_tag:
            return {
                "data": {
                    "nodes": [],
                    "edges": [],
                    "meta": {
                        "total_nodes_before_trim": 0,
                        "total_edges_before_trim": 0,
                        "truncated": False,
                        "applied_limit_nodes": limit_nodes,
                        "applied_min_weight": round(float(min_weight), 3),
                        "applied_knowledge_min_score": round(float(knowledge_min_score), 3),
                        "applied_edge_policy": policy,
                        "embedding_provider": embedding_backend.get("provider"),
                        "embedding_model": embedding_backend.get("model"),
                        "embedding_enabled": bool(embedding_backend.get("enabled")),
                        "cluster_count": 0,
                        "dominant_cluster_id": None,
                        "density_score": 0.0,
                    },
                }
            }
        target_tag_id = target_tag.id
        content_tags = [ct for ct in content_tags if ct.tag_id == target_tag_id]

    allowed_content_ids: Optional[set[UUID]] = None
    if target_tag_id is not None:
        allowed_content_ids = {ct.content_id for ct in content_tags}
        notes = [row for row in notes if row.id in allowed_content_ids]
        posts = [row for row in posts if row.id in allowed_content_ids]
        note_ids = {row.id for row in notes}
        post_ids = {row.id for row in posts}

    node_map: dict[str, dict[str, Any]] = {}
    content_node_ids: list[str] = []
    recency_map: dict[str, float] = {}
    tokens_by_node: dict[str, set[str]] = {}

    for row in notes:
        node_id = str(row.id)
        updated_at = row.updated_at or row.created_at
        node_map[node_id] = {
            "id": node_id,
            "type": "research_note",
            "label": row.title,
            "author_id": str(row.user_id),
            "project_id": str(row.project_id) if row.project_id else None,
            "updated_at": updated_at,
            "importance": 0.0,
            "size": 5.0,
        }
        content_node_ids.append(node_id)
        recency_map[node_id] = _to_timestamp(updated_at)
        tokens_by_node[node_id] = _tokenize(row.title, row.content)

    for row in posts:
        node_id = str(row.id)
        updated_at = row.updated_at or row.created_at
        node_map[node_id] = {
            "id": node_id,
            "type": "shared_post",
            "label": row.title,
            "author_id": str(row.user_id),
            "project_id": str(row.project_id) if row.project_id else None,
            "updated_at": updated_at,
            "importance": 0.0,
            "size": 5.0,
        }
        content_node_ids.append(node_id)
        recency_map[node_id] = _to_timestamp(updated_at)
        tokens_by_node[node_id] = _tokenize(row.title, row.content)

    tag_rows: list[Tag] = []
    if "tag" in requested_types:
        tag_ids = {ct.tag_id for ct in content_tags}
        if target_tag_id is not None:
            tag_ids = {target_tag_id}
        if tag_ids:
            tag_rows = db.query(Tag).filter(Tag.id.in_(list(tag_ids))).all()

    for row in tag_rows:
        node_id = str(row.id)
        node_map[node_id] = {
            "id": node_id,
            "type": "tag",
            "label": row.name,
            "author_id": str(row.created_by) if row.created_by else None,
            "project_id": None,
            "updated_at": row.created_at,
            "importance": 0.0,
            "size": 4.0,
        }
        recency_map[node_id] = _to_timestamp(row.created_at)

    edge_map: dict[tuple[str, str], dict[str, Any]] = {}

    tags_by_content: dict[str, set[str]] = defaultdict(set)
    content_ids_by_tag: dict[str, list[str]] = defaultdict(list)

    for ct in content_tags:
        content_id = str(ct.content_id)
        tag_id = str(ct.tag_id)

        if content_id not in node_map:
            continue

        tags_by_content[content_id].add(tag_id)
        content_ids_by_tag[tag_id].append(content_id)

        if allow_tag_edges and tag_id in node_map:
            _add_edge(edge_map, content_id, tag_id, "has_tag", EDGE_WEIGHTS["has_tag"])

    if allow_tag_edges:
        shared_tag_overlap: dict[tuple[str, str], int] = defaultdict(int)
        for content_ids in content_ids_by_tag.values():
            candidates = sorted(
                set(content_ids),
                key=lambda node_id: recency_map.get(node_id, 0.0),
                reverse=True,
            )[:MAX_PAIR_CANDIDATES_PER_GROUP]

            for i in range(len(candidates)):
                for j in range(i + 1, len(candidates)):
                    pair = _edge_key(candidates[i], candidates[j])
                    shared_tag_overlap[pair] += 1

        for (source_id, target_id), overlap in shared_tag_overlap.items():
            weight = min(0.85, 0.35 + (0.12 * overlap))
            _add_edge(edge_map, source_id, target_id, "shared_tag", weight)

    by_author: dict[str, list[str]] = defaultdict(list)
    by_project: dict[str, list[str]] = defaultdict(list)

    for node_id in content_node_ids:
        node = node_map.get(node_id)
        if not node:
            continue

        author_id = node.get("author_id")
        project_ref = node.get("project_id")

        if isinstance(author_id, str) and author_id:
            by_author[author_id].append(node_id)

        if isinstance(project_ref, str) and project_ref:
            by_project[project_ref].append(node_id)

    if allow_context_edges:
        for group in by_author.values():
            candidates = sorted(
                set(group),
                key=lambda node_id: recency_map.get(node_id, 0.0),
                reverse=True,
            )[:MAX_PAIR_CANDIDATES_PER_GROUP]
            for i in range(len(candidates)):
                for j in range(i + 1, len(candidates)):
                    _add_edge(edge_map, candidates[i], candidates[j], "same_author", EDGE_WEIGHTS["same_author"])

        for group in by_project.values():
            candidates = sorted(
                set(group),
                key=lambda node_id: recency_map.get(node_id, 0.0),
                reverse=True,
            )[:MAX_PAIR_CANDIDATES_PER_GROUP]
            for i in range(len(candidates)):
                for j in range(i + 1, len(candidates)):
                    _add_edge(edge_map, candidates[i], candidates[j], "same_project", EDGE_WEIGHTS["same_project"])

    if allow_text_similarity:
        token_index: dict[str, list[str]] = defaultdict(list)
        for node_id, tokens in tokens_by_node.items():
            for token in tokens:
                token_index[token].append(node_id)

        overlap_counts: dict[tuple[str, str], int] = defaultdict(int)
        for token, node_ids in token_index.items():
            if len(node_ids) < 2:
                continue
            candidates = sorted(
                set(node_ids),
                key=lambda value: recency_map.get(value, 0.0),
                reverse=True,
            )[:MAX_PAIR_CANDIDATES_PER_TOKEN]

            if len(candidates) < 2:
                continue

            for i in range(len(candidates)):
                for j in range(i + 1, len(candidates)):
                    pair = _edge_key(candidates[i], candidates[j])
                    overlap_counts[pair] += 1

        for (source_id, target_id), overlap in overlap_counts.items():
            if overlap < 2:
                continue

            tokens_a = tokens_by_node.get(source_id, set())
            tokens_b = tokens_by_node.get(target_id, set())
            similarity = _jaccard_score(tokens_a, tokens_b)
            if similarity < 0.18:
                continue

            similarity_weight = 0.2 + (max(0.0, similarity - 0.18) / 0.42) * 0.5
            similarity_weight = max(0.2, min(0.7, similarity_weight))
            _add_edge(edge_map, source_id, target_id, "text_similarity", similarity_weight)

    if include_knowledge_edges and allow_ai_edges and content_node_ids:
        source_to_node_id: dict[tuple[str, UUID], str] = {}
        for node_id in content_node_ids:
            node = node_map.get(node_id)
            if not node:
                continue
            node_type = str(node.get("type") or "")
            if node_type not in {"research_note", "shared_post"}:
                continue
            try:
                source_to_node_id[(node_type, UUID(node_id))] = node_id
            except ValueError:
                continue

        source_filters = []
        note_source_ids = [source_id for (source_type, source_id) in source_to_node_id.keys() if source_type == "research_note"]
        post_source_ids = [source_id for (source_type, source_id) in source_to_node_id.keys() if source_type == "shared_post"]
        if note_source_ids:
            source_filters.append(
                and_(
                    KnowledgeDocument.source_type == "research_note",
                    KnowledgeDocument.source_id.in_(note_source_ids),
                )
            )
        if post_source_ids:
            source_filters.append(
                and_(
                    KnowledgeDocument.source_type == "shared_post",
                    KnowledgeDocument.source_id.in_(post_source_ids),
                )
            )

        doc_rows = (
            db.query(KnowledgeDocument)
            .filter(KnowledgeDocument.is_deleted.is_(False), or_(*source_filters))
            .all()
            if source_filters
            else []
        )
        doc_id_to_node: dict[str, str] = {}
        doc_ids: list[UUID] = []
        for doc in doc_rows:
            mapped_node = source_to_node_id.get((str(doc.source_type), doc.source_id))
            if not mapped_node:
                continue
            doc_id_to_node[str(doc.id)] = mapped_node
            doc_ids.append(doc.id)

        if doc_ids:
            knowledge_links = (
                db.query(KnowledgeLink)
                .filter(
                    KnowledgeLink.link_type == "semantic_similarity",
                    KnowledgeLink.score >= knowledge_min_score,
                    KnowledgeLink.from_document_id.in_(doc_ids),
                    KnowledgeLink.to_document_id.in_(doc_ids),
                )
                .all()
            )
            for link in knowledge_links:
                source_id = doc_id_to_node.get(str(link.from_document_id))
                target_id = doc_id_to_node.get(str(link.to_document_id))
                if not source_id or not target_id or source_id == target_id:
                    continue
                scaled_weight = max(0.25, min(0.82, 0.2 + (float(link.score) * 0.62)))
                _add_edge(edge_map, source_id, target_id, "semantic_similarity", scaled_weight)

    all_edges = []
    for edge in edge_map.values():
        weight = round(float(edge["weight"]), 4)
        if weight < min_weight:
            continue
        reasons = sorted(list(edge["reasons"]))
        primary_reason = _primary_reason(reasons)
        style_hint = _style_hint(reasons)

        distance = max(55.0, 180.0 - (weight * 120.0))
        all_edges.append(
            {
                "source": edge["source"],
                "target": edge["target"],
                "type": edge["type"],
                "weight": weight,
                "reasons": reasons,
                "reason_primary": primary_reason,
                "style_hint": style_hint,
                "distance": round(distance, 2),
            }
        )

    all_nodes = list(node_map.values())
    centrality_map = _compute_centrality_map({str(node["id"]) for node in all_nodes}, all_edges)
    _apply_node_scores(all_nodes, all_edges, centrality_map=centrality_map)

    total_nodes_before_trim = len(all_nodes)
    total_edges_before_trim = len(all_edges)

    truncated = False
    if len(all_nodes) > limit_nodes:
        mandatory_ids: set[str] = set()
        if target_tag_id is not None:
            mandatory_ids.add(str(target_tag_id))

        sorted_nodes = sorted(
            all_nodes,
            key=lambda node: (
                float(node.get("importance") or 0.0),
                recency_map.get(str(node["id"]), 0.0),
            ),
            reverse=True,
        )

        kept_nodes: list[dict[str, Any]] = []
        kept_ids: set[str] = set()

        for node in sorted_nodes:
            node_id = str(node["id"])
            if node_id in mandatory_ids and node_id not in kept_ids:
                kept_nodes.append(node)
                kept_ids.add(node_id)

        for node in sorted_nodes:
            if len(kept_nodes) >= limit_nodes:
                break
            node_id = str(node["id"])
            if node_id in kept_ids:
                continue
            kept_nodes.append(node)
            kept_ids.add(node_id)

        all_nodes = kept_nodes
        all_edges = [
            edge
            for edge in all_edges
            if edge["source"] in kept_ids and edge["target"] in kept_ids
        ]
        truncated = True

        centrality_map = _compute_centrality_map(kept_ids, all_edges)
        _apply_node_scores(all_nodes, all_edges, centrality_map=centrality_map)

    final_node_ids = {str(node["id"]) for node in all_nodes}
    if all_nodes and not centrality_map:
        centrality_map = _compute_centrality_map(final_node_ids, all_edges)
    cluster_map, cluster_count, dominant_cluster_id = _cluster_map_from_edges(final_node_ids, all_edges)
    density_score = _graph_density_score(len(all_nodes), len(all_edges))

    nodes_out = []
    for node in all_nodes:
        updated_at = node.get("updated_at")
        node_id = str(node["id"])
        nodes_out.append(
            {
                "id": node_id,
                "type": str(node["type"]),
                "label": str(node["label"]),
                "author_id": node.get("author_id"),
                "project_id": node.get("project_id"),
                "updated_at": updated_at.isoformat() if isinstance(updated_at, datetime) else None,
                "size": float(node.get("size") or 4.0),
                "importance": float(node.get("importance") or 0.0),
                "centrality": float((centrality_map or {}).get(node_id, 0.0)),
                "cluster_id": cluster_map.get(node_id),
            }
        )

    return {
        "data": {
            "nodes": nodes_out,
            "edges": all_edges,
            "meta": {
                "total_nodes_before_trim": int(total_nodes_before_trim),
                "total_edges_before_trim": int(total_edges_before_trim),
                "truncated": bool(truncated),
                "applied_limit_nodes": int(limit_nodes),
                "applied_min_weight": round(float(min_weight), 3),
                "applied_knowledge_min_score": round(float(knowledge_min_score), 3),
                "applied_edge_policy": policy,
                "embedding_provider": embedding_backend.get("provider"),
                "embedding_model": embedding_backend.get("model"),
                "embedding_enabled": bool(embedding_backend.get("enabled")),
                "cluster_count": int(cluster_count),
                "dominant_cluster_id": dominant_cluster_id,
                "density_score": density_score,
            },
        }
    }
