from __future__ import annotations

import hashlib
import re
from typing import Any, Dict, Optional
from uuid import UUID

from app.services.storage_service import storage_service


DEFAULT_MEMBER_COLORS = [
    "#4F46E5",
    "#0EA5E9",
    "#10B981",
    "#F59E0B",
    "#EF4444",
    "#EC4899",
    "#8B5CF6",
    "#14B8A6",
    "#84CC16",
    "#F97316",
]

ALLOWED_PROFILE_THEMES = {"aurora", "sunset", "forest", "mono", "ocean"}
ALLOWED_AUTOSAVE_INTERVALS = {"30", "60", "off"}
ALLOWED_DATE_FORMATS = {"iso", "us", "ko"}
ALLOWED_EDITOR_MODES = {"simple", "advanced"}
ALLOWED_SHARE_SCOPES = {"private", "shared"}
ALLOWED_PROFILE_CARD_STYLES = {"minimal", "expressive"}
HEX_COLOR_PATTERN = re.compile(r"^#[0-9a-fA-F]{6}$")
DEFAULT_HOME_WIDGETS = {
    "show_continue_writing": True,
    "show_drafts": True,
    "show_notification_summary": True,
    "show_recent_activity": True,
}

MAX_STATUS_LEN = 80
MAX_PRONOUNS_LEN = 40
MAX_BANNER_LEN = 120


def _normalize_hex_color(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    candidate = value.strip()
    if not HEX_COLOR_PATTERN.match(candidate):
        return None
    return candidate.lower()


def _normalize_text(value: Any, limit: int) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    return cleaned[:limit]


def _coerce_bool(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    return None


def _normalize_uuid_str(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    try:
        return str(UUID(cleaned))
    except ValueError:
        return None


def deterministic_member_color(user_id: UUID | str) -> str:
    digest = hashlib.sha256(str(user_id).encode("utf-8")).hexdigest()
    idx = int(digest[:8], 16) % len(DEFAULT_MEMBER_COLORS)
    return DEFAULT_MEMBER_COLORS[idx]


def sanitize_preferences(raw: Any) -> Dict[str, Any]:
    prefs = raw if isinstance(raw, dict) else {}
    out: Dict[str, Any] = {}

    autosave_interval = prefs.get("autosave_interval")
    if autosave_interval in ALLOWED_AUTOSAVE_INTERVALS:
        out["autosave_interval"] = autosave_interval

    date_format = prefs.get("date_format")
    if date_format in ALLOWED_DATE_FORMATS:
        out["date_format"] = date_format

    for key in (
        "notify_comments",
        "notify_likes",
        "notify_reactions",
        "notify_replies",
        "notify_mentions",
    ):
        value = _coerce_bool(prefs.get(key))
        if value is not None:
            out[key] = value

    profile_theme = prefs.get("profile_theme")
    if profile_theme in ALLOWED_PROFILE_THEMES:
        out["profile_theme"] = profile_theme

    default_editor_mode = prefs.get("default_editor_mode")
    if default_editor_mode in ALLOWED_EDITOR_MODES:
        out["default_editor_mode"] = default_editor_mode

    default_share_scope = prefs.get("default_share_scope")
    if default_share_scope in ALLOWED_SHARE_SCOPES:
        out["default_share_scope"] = default_share_scope

    profile_card_style = prefs.get("profile_card_style")
    if profile_card_style in ALLOWED_PROFILE_CARD_STYLES:
        out["profile_card_style"] = profile_card_style

    default_project_id = _normalize_uuid_str(prefs.get("default_project_id"))
    if default_project_id is not None:
        out["default_project_id"] = default_project_id

    home_widgets = prefs.get("home_widgets")
    if isinstance(home_widgets, dict):
        normalized_widgets: Dict[str, bool] = {}
        for key, default_value in DEFAULT_HOME_WIDGETS.items():
            value = _coerce_bool(home_widgets.get(key))
            if value is not None:
                normalized_widgets[key] = value
            else:
                normalized_widgets[key] = default_value
        out["home_widgets"] = normalized_widgets

    member_color = _normalize_hex_color(prefs.get("member_color"))
    if member_color is not None:
        out["member_color"] = member_color

    accent_color = _normalize_hex_color(prefs.get("accent_color"))
    if accent_color is not None:
        out["accent_color"] = accent_color

    status_message = _normalize_text(prefs.get("status_message"), MAX_STATUS_LEN)
    if status_message is not None:
        out["status_message"] = status_message

    pronouns = _normalize_text(prefs.get("pronouns"), MAX_PRONOUNS_LEN)
    if pronouns is not None:
        out["pronouns"] = pronouns

    banner_text = _normalize_text(prefs.get("banner_text"), MAX_BANNER_LEN)
    if banner_text is not None:
        out["banner_text"] = banner_text

    return out


def merge_preferences(existing: Any, updates: Any) -> Dict[str, Any]:
    merged = sanitize_preferences(existing)
    updates_dict = updates if isinstance(updates, dict) else {}
    for key in ("status_message", "pronouns", "banner_text", "member_color", "accent_color", "profile_theme"):
        if key not in updates_dict:
            continue
        value = updates_dict.get(key)
        if value is None:
            merged.pop(key, None)
            continue
        if isinstance(value, str) and not value.strip():
            merged.pop(key, None)

    for key in ("default_project_id", "default_editor_mode", "default_share_scope", "profile_card_style"):
        if key not in updates_dict:
            continue
        value = updates_dict.get(key)
        if value is None:
            merged.pop(key, None)
            continue
        if isinstance(value, str) and not value.strip():
            merged.pop(key, None)

    if "home_widgets" in updates_dict and updates_dict.get("home_widgets") is None:
        merged.pop("home_widgets", None)

    merged.update(sanitize_preferences(updates_dict))
    return merged


def preferences_for_response(user_id: UUID | str, raw_preferences: Any) -> Dict[str, Any]:
    prefs = sanitize_preferences(raw_preferences)
    prefs.setdefault("autosave_interval", "30")
    prefs.setdefault("date_format", "iso")
    prefs.setdefault("notify_comments", True)
    prefs.setdefault("notify_likes", True)
    prefs.setdefault("notify_reactions", True)
    prefs.setdefault("notify_replies", True)
    prefs.setdefault("notify_mentions", True)
    prefs.setdefault("profile_theme", "aurora")
    prefs.setdefault("default_editor_mode", "advanced")
    prefs.setdefault("default_share_scope", "private")
    prefs.setdefault("profile_card_style", "minimal")
    prefs.setdefault("home_widgets", dict(DEFAULT_HOME_WIDGETS))
    prefs.setdefault("member_color", deterministic_member_color(user_id))
    return prefs


def resolve_member_color(user_id: UUID | str, raw_preferences: Any) -> str:
    prefs = sanitize_preferences(raw_preferences)
    color = prefs.get("member_color")
    if isinstance(color, str) and HEX_COLOR_PATTERN.match(color):
        return color.lower()
    return deterministic_member_color(user_id)


def is_notification_enabled(raw_preferences: Any, key: str, default: bool = True) -> bool:
    prefs = preferences_for_response("00000000-0000-0000-0000-000000000000", raw_preferences)
    value = prefs.get(key)
    if isinstance(value, bool):
        return value
    return default


def normalize_avatar_url(raw_avatar_url: Any) -> Optional[str]:
    if raw_avatar_url is None:
        return None
    if not isinstance(raw_avatar_url, str):
        return None
    return storage_service.canonicalize_upload_url(raw_avatar_url)


def resolve_avatar_url(raw_avatar_url: Any) -> Optional[str]:
    if raw_avatar_url is None:
        return None
    if not isinstance(raw_avatar_url, str):
        return None
    return storage_service.resolve_public_url(raw_avatar_url)
