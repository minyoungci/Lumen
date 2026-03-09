"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { api } from "@/lib/api";
import { hexToRgba, resolveMemberColor } from "@/lib/memberColor";
import { notificationTabTone } from "@/lib/contentColor";

type NotificationTab = "all" | "comments" | "replies" | "reactions" | "mentions" | "system" | "other";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  is_read: boolean;
  created_at?: string;
  actor?: {
    id?: string;
    display_name?: string;
    avatar_url?: string;
    member_color?: string;
  };
}

interface NotificationSummary {
  unread_total: number;
  categories: Record<string, number>;
  by_type?: Record<string, { read: number; unread: number; total: number }>;
}

interface NotificationGroup {
  key: string;
  type: string;
  category: NotificationTab;
  link?: string;
  ids: string[];
  unreadCount: number;
  totalCount: number;
  latest: NotificationRow;
}

const TAB_LABEL: Record<NotificationTab, string> = {
  all: "All",
  comments: "Comments",
  replies: "Replies",
  reactions: "Reactions",
  mentions: "Mentions",
  system: "System",
  other: "Other",
};

function notificationCategory(type: string): NotificationTab {
  if (type === "comment_on_post") return "comments";
  if (type === "comment_reply") return "replies";
  if (type === "comment_reaction") return "reactions";
  if (type === "mention") return "mentions";
  if (type === "storage_integrity_alert" || type.startsWith("system_") || type.endsWith("_alert")) {
    return "system";
  }
  return "other";
}

function notificationBadge(type: string): { label: string; chip: string } {
  if (type === "comment_on_post") return { label: "Comment", chip: "New comment" };
  if (type === "comment_reply") return { label: "Reply", chip: "Reply" };
  if (type === "comment_reaction") return { label: "Reaction", chip: "Reaction" };
  if (type === "mention") return { label: "Mention", chip: "@ Mention" };
  if (type === "storage_integrity_alert" || type.startsWith("system_") || type.endsWith("_alert")) {
    return { label: "System", chip: "System" };
  }
  return { label: "Other", chip: "Update" };
}

function formatWhen(value?: string): string {
  if (!value) return "";
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SummaryCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  tone?: ReturnType<typeof notificationTabTone>;
}) {
  return (
    <div
      className="workspace-stat px-4 py-4"
      style={
        tone
          ? { borderColor: tone.border, backgroundColor: tone.soft }
          : undefined
      }
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.03em]" style={{ color: tone?.base ?? "#0f172a" }}>
        {value}
      </p>
      <p className="mt-1 text-sm text-text-secondary">{hint}</p>
    </div>
  );
}

export default function NotificationsPage() {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [summary, setSummary] = useState<NotificationSummary>({ unread_total: 0, categories: {} });
  const [loading, setLoading] = useState(true);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [activeTab, setActiveTab] = useState<NotificationTab>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, summaryRes] = await Promise.all([
        api.get("/notifications", {
          params: { limit: 120, ...(onlyUnread ? { is_read: false } : {}) },
        }),
        api
          .get("/notifications/summary")
          .catch(() => ({ data: { data: { unread_total: 0, categories: {} } } })),
      ]);

      setRows(Array.isArray(listRes.data?.data) ? (listRes.data.data as NotificationRow[]) : []);
      setSummary((summaryRes.data?.data ?? { unread_total: 0, categories: {} }) as NotificationSummary);
    } catch {
      setRows([]);
      setSummary({ unread_total: 0, categories: {} });
    } finally {
      setLoading(false);
    }
  }, [onlyUnread]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const map = new Map<string, NotificationGroup>();

    for (const row of rows) {
      const category = notificationCategory(row.type);
      if (activeTab !== "all" && category !== activeTab) continue;

      const normalizedLink = row.link && row.link.startsWith("/") ? row.link : "";
      const key = `${row.type}::${normalizedLink || row.id}`;
      const existing = map.get(key);

      if (!existing) {
        map.set(key, {
          key,
          type: row.type,
          category,
          link: normalizedLink || undefined,
          ids: [row.id],
          unreadCount: row.is_read ? 0 : 1,
          totalCount: 1,
          latest: row,
        });
        continue;
      }

      existing.ids.push(row.id);
      existing.totalCount += 1;
      if (!row.is_read) existing.unreadCount += 1;
      if ((row.created_at ?? "") > (existing.latest.created_at ?? "")) {
        existing.latest = row;
      }
    }

    return Array.from(map.values()).sort((left, right) => {
      const unreadDelta = Number(right.unreadCount > 0) - Number(left.unreadCount > 0);
      if (unreadDelta !== 0) return unreadDelta;
      return (right.latest.created_at ?? "").localeCompare(left.latest.created_at ?? "");
    });
  }, [activeTab, rows]);

  const pendingGroups = groups.filter((group) => group.unreadCount > 0);
  const handledGroups = groups.filter((group) => group.unreadCount === 0);

  const markAll = async () => {
    setBusyId("all");
    try {
      await api.patch("/notifications/read-all");
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const markGroupAsRead = async (group: NotificationGroup) => {
    setBusyId(group.key);
    try {
      await Promise.all(group.ids.map((id) => api.patch(`/notifications/${id}/read`).catch(() => null)));
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const deleteGroup = async (group: NotificationGroup) => {
    setBusyId(group.key);
    try {
      await Promise.all(group.ids.map((id) => api.delete(`/notifications/${id}`).catch(() => null)));
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const tabOrder: NotificationTab[] = ["all", "comments", "replies", "reactions", "mentions", "system", "other"];
  const commentSignalCount = (summary.categories.comments ?? 0) + (summary.categories.replies ?? 0);
  const mentionSignalCount = (summary.categories.reactions ?? 0) + (summary.categories.mentions ?? 0);

  const renderGroup = (group: NotificationGroup) => {
    const row = group.latest;
    const badge = notificationBadge(group.type);
    const tone = notificationTabTone(group.category);
    const actorColor = resolveMemberColor(row.actor?.id, row.actor?.member_color);
    const when = formatWhen(row.created_at);
    const href = group.link;
    const busy = busyId === group.key;

    return (
      <GlassCard key={group.key} className={group.unreadCount === 0 ? "opacity-85" : ""}>
        <div
          className="workspace-row px-4 py-4"
          style={{ borderLeftWidth: 4, borderLeftColor: tone.base, borderColor: "rgba(0,0,0,0.06)" }}
        >
          <div className="flex items-start gap-3">
            <UserAvatar
              displayName={row.actor?.display_name}
              avatarUrl={row.actor?.avatar_url}
              userId={row.actor?.id}
              memberColor={row.actor?.member_color}
              className="h-10 w-10 shrink-0 text-xs"
              alt=""
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="rounded-[10px] border px-2 py-0.5 text-[11px] font-medium"
                  style={{ borderColor: tone.border, backgroundColor: tone.soft, color: tone.base }}
                >
                  {badge.chip}
                </span>
                {row.actor?.display_name ? (
                  <span
                    className="rounded-[10px] border px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      borderColor: hexToRgba(actorColor, 0.36),
                      backgroundColor: hexToRgba(actorColor, 0.10),
                      color: actorColor,
                    }}
                  >
                    {row.actor.display_name}
                  </span>
                ) : null}
                {group.unreadCount > 0 ? <span className="h-2 w-2 rounded-full bg-primary-500" /> : null}
                {group.totalCount > 1 ? (
                  <span className="rounded-[10px] border border-black/10 bg-black/[0.03] px-2 py-0.5 text-[11px] text-text-muted">
                    {group.totalCount} linked items
                  </span>
                ) : null}
                {when ? <span className="ml-auto text-xs text-text-muted">{when}</span> : null}
              </div>

              <p className="mt-2 text-sm font-semibold text-text-primary">{row.title}</p>
              {row.body ? <p className="mt-1.5 line-clamp-2 text-sm text-text-secondary">{row.body}</p> : null}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {group.unreadCount > 0 ? (
                  <button
                    onClick={() => void markGroupAsRead(group)}
                    disabled={busy}
                    className="rounded-[10px] border border-black/10 bg-white px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-black/[0.03] disabled:opacity-60"
                  >
                    {busy ? "Working..." : `Mark read (${group.unreadCount})`}
                  </button>
                ) : null}
                {href ? (
                  <Link
                    href={href}
                    className="rounded-[10px] border border-black/10 bg-white px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-black/[0.03]"
                  >
                    Open target
                  </Link>
                ) : null}
                <button
                  onClick={() => void deleteGroup(group)}
                  disabled={busy}
                  className="rounded-[10px] border border-red-200/60 bg-red-50 px-3 py-1.5 text-xs text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>
    );
  };

  return (
    <div className="space-y-5">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="bg-white/88 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Inbox</p>
            <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-text-primary md:text-[38px]">
              Signals that still need a decision.
            </h1>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-text-secondary">
              Treat the inbox as a queue, not a feed. Read what matters, jump to the work, then clear the signal.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <button
                onClick={() => setOnlyUnread((prev) => !prev)}
                className={`rounded-[12px] px-4 py-2.5 text-sm font-medium transition-colors ${
                  onlyUnread
                    ? "bg-primary-500 text-white hover:bg-primary-600"
                    : "border border-black/10 bg-white text-text-primary hover:bg-black/[0.03]"
                }`}
              >
                {onlyUnread ? "Showing unread only" : "Show unread only"}
              </button>
              <button
                onClick={() => void markAll()}
                disabled={busyId === "all"}
                className="rounded-[12px] border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03] disabled:opacity-60"
              >
                {busyId === "all" ? "Marking..." : "Mark all read"}
              </button>
            </div>
          </div>

          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-3 lg:grid-cols-1">
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Unread</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{summary.unread_total}</p>
              <p className="mt-1 text-sm text-text-secondary">Items still waiting for attention.</p>
            </div>
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Pending groups</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{pendingGroups.length}</p>
              <p className="mt-1 text-sm text-text-secondary">Grouped by the same destination so the queue stays smaller.</p>
            </div>
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Handled</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{handledGroups.length}</p>
              <p className="mt-1 text-sm text-text-secondary">Recent signals you have already cleared.</p>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <GlassCard className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <SummaryCard label="Unread" value={summary.unread_total} hint="Still active in the queue." />
              <SummaryCard
                label="Comments"
                value={commentSignalCount}
                hint="Replies and new comments on work."
                tone={notificationTabTone("comments")}
              />
              <SummaryCard
                label="Mentions"
                value={mentionSignalCount}
                hint="Reactions or direct mentions."
                tone={notificationTabTone("mentions")}
              />
              <SummaryCard
                label="System"
                value={summary.categories.system ?? 0}
                hint="Operational signals worth checking."
                tone={notificationTabTone("system")}
              />
            </div>

            <div className="flex gap-1 overflow-x-auto pb-1">
              {tabOrder.map((tab) => {
                const count =
                  tab === "all"
                    ? summary.unread_total
                    : Number(summary.categories[tab] ?? (tab === "other" ? summary.categories.other ?? 0 : 0));
                const tone = notificationTabTone(tab);

                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-[10px] border px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeTab === tab ? "text-white" : "text-text-secondary hover:bg-black/[0.08]"
                    }`}
                    style={
                      activeTab === tab
                        ? { backgroundColor: tone.base, borderColor: tone.base }
                        : { borderColor: "rgba(15,23,42,0.08)" }
                    }
                  >
                    {TAB_LABEL[tab]}
                    {count > 0 ? ` ${count}` : ""}
                  </button>
                );
              })}
            </div>
          </GlassCard>

          {loading ? (
            <GlassCard>
              <p className="text-sm text-text-muted">Loading inbox...</p>
            </GlassCard>
          ) : groups.length === 0 ? (
            <GlassCard>
              <p className="text-sm text-text-primary">Your inbox is clear.</p>
              <p className="mt-1 text-sm text-text-secondary">New comments, mentions, and reactions will appear here.</p>
            </GlassCard>
          ) : (
            <>
              <GlassCard className="space-y-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Needs attention</p>
                  <p className="mt-2 text-sm text-text-secondary">Unread groups are shown first so you can process the queue quickly.</p>
                </div>
                {pendingGroups.length === 0 ? (
                  <p className="text-sm text-text-muted">No unread items in this filter.</p>
                ) : (
                  <div className="space-y-3">{pendingGroups.map(renderGroup)}</div>
                )}
              </GlassCard>

              {handledGroups.length > 0 ? (
                <GlassCard className="space-y-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Handled recently</p>
                    <p className="mt-2 text-sm text-text-secondary">Read items stay available until you dismiss them.</p>
                  </div>
                  <div className="space-y-3">{handledGroups.map(renderGroup)}</div>
                </GlassCard>
              ) : null}
            </>
          )}
        </div>

        <GlassCard className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Working rule</p>
          <div className="space-y-3">
            <div className="workspace-inset px-4 py-4">
              <p className="text-sm font-medium text-text-primary">Open only what matters</p>
              <p className="mt-1 text-sm text-text-secondary">Use the unread filter first, then narrow by signal type if the queue is noisy.</p>
            </div>
            <div className="workspace-inset px-4 py-4">
              <p className="text-sm font-medium text-text-primary">Clear the signal fast</p>
              <p className="mt-1 text-sm text-text-secondary">Mark a group as read after you have seen it. Dismiss it if the signal no longer matters.</p>
            </div>
            <div className="workspace-inset px-4 py-4">
              <p className="text-sm font-medium text-text-primary">Return to the work</p>
              <p className="mt-1 text-sm text-text-secondary">The goal of the inbox is to route you back to the page where the actual collaboration is happening.</p>
            </div>
            <Link
              href="/shared/feed"
              className="workspace-inset block px-4 py-4 transition-colors hover:bg-white"
            >
              <p className="text-sm font-medium text-text-primary">Open updates</p>
              <p className="mt-1 text-sm text-text-secondary">Scan the project feed after you clear the inbox.</p>
            </Link>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
