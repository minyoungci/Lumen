from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict

DEFAULT_SITE_CONFIG: Dict[str, Any] = {
    "navigation": {
        "team_section_title": "Team",
        "shared_group_label": "Shared Space",
        "shared_overview_label": "Overview",
        "shared_feed_label": "Feed",
        "shared_articles_label": "Articles",
        "schedule_label": "Schedule",
        "graph_label": "Knowledge Graph",
    },
    "home": {
        "quick_actions": {
            "title": "QUICK ACTION",
            "new_note_label": "새 리서치 노트 작성",
            "share_article_label": "팀 아티클 공유",
            "open_feed_label": "팀 Feed 보기",
        }
    },
    "shared_overview": {
        "title": "Shared Space",
        "description": "팀 문서(Articles)와 Feed를 관리합니다.",
        "articles_title": "Articles",
        "articles_description": "공유 아티클 문서를 확인하고 작성합니다.",
        "feed_title": "Feed",
        "feed_description": "팀 인사이트와 작업 카드를 피드 형태로 확인합니다.",
    },
}

_TEXT_LIMITS: Dict[tuple[str, ...], int] = {
    ("navigation", "team_section_title"): 40,
    ("navigation", "shared_group_label"): 40,
    ("navigation", "shared_overview_label"): 40,
    ("navigation", "shared_feed_label"): 40,
    ("navigation", "shared_articles_label"): 40,
    ("navigation", "schedule_label"): 40,
    ("navigation", "graph_label"): 60,
    ("home", "quick_actions", "title"): 60,
    ("home", "quick_actions", "new_note_label"): 80,
    ("home", "quick_actions", "share_article_label"): 80,
    ("home", "quick_actions", "open_feed_label"): 80,
    ("shared_overview", "title"): 80,
    ("shared_overview", "description"): 160,
    ("shared_overview", "articles_title"): 80,
    ("shared_overview", "articles_description"): 160,
    ("shared_overview", "feed_title"): 80,
    ("shared_overview", "feed_description"): 160,
}


def _safe_text(value: Any, fallback: str, max_len: int) -> str:
    if not isinstance(value, str):
        return fallback
    cleaned = value.strip()
    if not cleaned:
        return fallback
    return cleaned[:max_len]


def ensure_site_config(raw: Any) -> Dict[str, Any]:
    payload = raw if isinstance(raw, dict) else {}

    navigation = payload.get("navigation") if isinstance(payload.get("navigation"), dict) else {}
    quick_actions_root = payload.get("home") if isinstance(payload.get("home"), dict) else {}
    quick_actions = (
        quick_actions_root.get("quick_actions")
        if isinstance(quick_actions_root.get("quick_actions"), dict)
        else {}
    )
    shared_overview = (
        payload.get("shared_overview")
        if isinstance(payload.get("shared_overview"), dict)
        else {}
    )

    defaults = DEFAULT_SITE_CONFIG
    nav_defaults = defaults["navigation"]
    qa_defaults = defaults["home"]["quick_actions"]
    shared_defaults = defaults["shared_overview"]

    return {
        "navigation": {
            "team_section_title": _safe_text(
                navigation.get("team_section_title"),
                nav_defaults["team_section_title"],
                _TEXT_LIMITS[("navigation", "team_section_title")],
            ),
            "shared_group_label": _safe_text(
                navigation.get("shared_group_label"),
                nav_defaults["shared_group_label"],
                _TEXT_LIMITS[("navigation", "shared_group_label")],
            ),
            "shared_overview_label": _safe_text(
                navigation.get("shared_overview_label"),
                nav_defaults["shared_overview_label"],
                _TEXT_LIMITS[("navigation", "shared_overview_label")],
            ),
            "shared_feed_label": _safe_text(
                navigation.get("shared_feed_label"),
                nav_defaults["shared_feed_label"],
                _TEXT_LIMITS[("navigation", "shared_feed_label")],
            ),
            "shared_articles_label": _safe_text(
                navigation.get("shared_articles_label"),
                nav_defaults["shared_articles_label"],
                _TEXT_LIMITS[("navigation", "shared_articles_label")],
            ),
            "schedule_label": _safe_text(
                navigation.get("schedule_label"),
                nav_defaults["schedule_label"],
                _TEXT_LIMITS[("navigation", "schedule_label")],
            ),
            "graph_label": _safe_text(
                navigation.get("graph_label"),
                nav_defaults["graph_label"],
                _TEXT_LIMITS[("navigation", "graph_label")],
            ),
        },
        "home": {
            "quick_actions": {
                "title": _safe_text(
                    quick_actions.get("title"),
                    qa_defaults["title"],
                    _TEXT_LIMITS[("home", "quick_actions", "title")],
                ),
                "new_note_label": _safe_text(
                    quick_actions.get("new_note_label"),
                    qa_defaults["new_note_label"],
                    _TEXT_LIMITS[("home", "quick_actions", "new_note_label")],
                ),
                "share_article_label": _safe_text(
                    quick_actions.get("share_article_label"),
                    qa_defaults["share_article_label"],
                    _TEXT_LIMITS[("home", "quick_actions", "share_article_label")],
                ),
                "open_feed_label": _safe_text(
                    quick_actions.get("open_feed_label"),
                    qa_defaults["open_feed_label"],
                    _TEXT_LIMITS[("home", "quick_actions", "open_feed_label")],
                ),
            }
        },
        "shared_overview": {
            "title": _safe_text(
                shared_overview.get("title"),
                shared_defaults["title"],
                _TEXT_LIMITS[("shared_overview", "title")],
            ),
            "description": _safe_text(
                shared_overview.get("description"),
                shared_defaults["description"],
                _TEXT_LIMITS[("shared_overview", "description")],
            ),
            "articles_title": _safe_text(
                shared_overview.get("articles_title"),
                shared_defaults["articles_title"],
                _TEXT_LIMITS[("shared_overview", "articles_title")],
            ),
            "articles_description": _safe_text(
                shared_overview.get("articles_description"),
                shared_defaults["articles_description"],
                _TEXT_LIMITS[("shared_overview", "articles_description")],
            ),
            "feed_title": _safe_text(
                shared_overview.get("feed_title"),
                shared_defaults["feed_title"],
                _TEXT_LIMITS[("shared_overview", "feed_title")],
            ),
            "feed_description": _safe_text(
                shared_overview.get("feed_description"),
                shared_defaults["feed_description"],
                _TEXT_LIMITS[("shared_overview", "feed_description")],
            ),
        },
    }


def deep_merge(base: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
    merged = deepcopy(base)
    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def configs_equal(a: Any, b: Any) -> bool:
    return ensure_site_config(a) == ensure_site_config(b)
