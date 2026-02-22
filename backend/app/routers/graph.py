from __future__ import annotations

from collections import defaultdict
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import RequestUser, get_current_user
from app.models.content_tag import ContentTag
from app.models.research_note import ResearchNote
from app.models.shared_post import SharedPost
from app.models.tag import Tag

router = APIRouter()


@router.get("", response_model=dict)
def get_graph(
    content_type: Optional[str] = Query(default=None),
    user_id: Optional[UUID] = Query(default=None),
    tag: Optional[str] = Query(default=None),
    project_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: RequestUser = Depends(get_current_user),
):
    requested_types = {"research_note", "shared_post", "tag"}
    if content_type:
        requested_types = {s.strip() for s in content_type.split(",") if s.strip()}

    nodes = []
    edges = []

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

    # permission scope for notes: owner + shared
    note_q = note_q.filter((ResearchNote.user_id == current_user.id) | (ResearchNote.is_shared.is_(True)))

    notes = note_q.all() if "research_note" in requested_types else []
    posts = post_q.all() if "shared_post" in requested_types else []
    tags = db.query(Tag).all() if "tag" in requested_types else []

    if tag:
        target_tag = db.query(Tag).filter(Tag.slug == tag).first()
        if not target_tag:
            return {"data": {"nodes": [], "edges": []}}
        tagged = db.query(ContentTag).filter(ContentTag.tag_id == target_tag.id).all()
        note_ids = {r.content_id for r in tagged if r.content_type == "research_note"}
        post_ids = {r.content_id for r in tagged if r.content_type == "shared_post"}
        notes = [n for n in notes if n.id in note_ids]
        posts = [p for p in posts if p.id in post_ids]
        if "tag" in requested_types:
            tags = [t for t in tags if t.id == target_tag.id]

    for note in notes:
        nodes.append({"id": str(note.id), "type": "research_note", "label": note.title})
    for post in posts:
        nodes.append({"id": str(post.id), "type": "shared_post", "label": post.title})
    for t in tags:
        nodes.append({"id": str(t.id), "type": "tag", "label": t.name})

    note_ids = {n.id for n in notes}
    post_ids = {p.id for p in posts}
    tag_ids = {t.id for t in tags}

    content_tags = db.query(ContentTag).all()
    tags_by_content = defaultdict(list)

    for ct in content_tags:
        if ct.tag_id not in tag_ids:
            continue
        if ct.content_type == "research_note" and ct.content_id in note_ids:
            edges.append(
                {
                    "source": str(ct.content_id),
                    "target": str(ct.tag_id),
                    "type": "has_tag",
                }
            )
            tags_by_content[("research_note", ct.content_id)].append(ct.tag_id)
        elif ct.content_type == "shared_post" and ct.content_id in post_ids:
            edges.append(
                {
                    "source": str(ct.content_id),
                    "target": str(ct.tag_id),
                    "type": "has_tag",
                }
            )
            tags_by_content[("shared_post", ct.content_id)].append(ct.tag_id)

    # shared tag edges among content nodes
    content_nodes = list(tags_by_content.keys())
    for i in range(len(content_nodes)):
        a = content_nodes[i]
        tags_a = set(tags_by_content[a])
        for j in range(i + 1, len(content_nodes)):
            b = content_nodes[j]
            if tags_a.intersection(tags_by_content[b]):
                edges.append(
                    {
                        "source": str(a[1]),
                        "target": str(b[1]),
                        "type": "shared_tag",
                    }
                )

    return {"data": {"nodes": nodes, "edges": edges}}
