import { hexToRgba } from "@/lib/memberColor";

export interface ColorTone {
  base: string;
  text: string;
  bg: string;
  border: string;
  soft: string;
}

function makeTone(base: string, bgAlpha = 0.14, borderAlpha = 0.36, softAlpha = 0.08): ColorTone {
  return {
    base,
    text: base,
    bg: hexToRgba(base, bgAlpha),
    border: hexToRgba(base, borderAlpha),
    soft: hexToRgba(base, softAlpha),
  };
}

const CONTENT_BASE = {
  feed: "#2563eb",
  article: "#ea580c",
  comment: "#0f766e",
  notification: "#7c3aed",
} as const;

export type ContentKind = keyof typeof CONTENT_BASE;

export function contentTone(kind: ContentKind): ColorTone {
  return makeTone(CONTENT_BASE[kind]);
}

type NotificationMeta = {
  label: string;
  icon: string;
  base: string;
  tab: string;
};

const NOTIFICATION_META: Record<string, NotificationMeta> = {
  comment_on_post: { label: "댓글", icon: "💬", base: "#0ea5e9", tab: "comments" },
  comment_reply: { label: "답글", icon: "↩️", base: "#6366f1", tab: "replies" },
  comment_reaction: { label: "반응", icon: "✨", base: "#ec4899", tab: "reactions" },
  mention: { label: "멘션", icon: "@", base: "#7c3aed", tab: "mentions" },
  storage_integrity_alert: { label: "시스템", icon: "🛟", base: "#ef4444", tab: "system" },
};

const NOTIFICATION_DEFAULT: NotificationMeta = {
  label: "기타",
  icon: "🔔",
  base: "#64748b",
  tab: "other",
};

export function notificationVisual(type: string): NotificationMeta & ColorTone {
  const normalized = (type || "").trim();
  const meta = NOTIFICATION_META[normalized];
  if (meta) {
    return { ...meta, ...makeTone(meta.base) };
  }
  if (
    normalized.startsWith("system_") ||
    normalized.endsWith("_alert")
  ) {
    const system = { label: "시스템", icon: "🛟", base: "#ef4444", tab: "system" };
    return { ...system, ...makeTone(system.base) };
  }
  return { ...NOTIFICATION_DEFAULT, ...makeTone(NOTIFICATION_DEFAULT.base) };
}

const TAB_BASE: Record<string, string> = {
  all: "#334155",
  comments: "#0ea5e9",
  replies: "#6366f1",
  reactions: "#ec4899",
  mentions: "#7c3aed",
  system: "#ef4444",
  other: "#64748b",
};

export function notificationTabTone(tab: string): ColorTone {
  return makeTone(TAB_BASE[tab] ?? TAB_BASE.other, 0.16, 0.42, 0.1);
}

const REACTION_BASE: Record<string, string> = {
  "👍": "#2563eb",
  "❤️": "#e11d48",
  "🔥": "#ea580c",
  "👏": "#059669",
  "👀": "#7c3aed",
  "🎉": "#d946ef",
};

export function reactionTone(emoji: string): ColorTone {
  return makeTone(REACTION_BASE[emoji] ?? "#64748b", 0.16, 0.42, 0.1);
}
