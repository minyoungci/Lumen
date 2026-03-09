"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { api } from "@/lib/api";
import { useProjectStore } from "@/store/project";
import { useSiteConfigStore } from "@/store/siteConfig";

interface DashboardDraftLog {
  id: string;
  log_date: string;
  status: "draft" | "private" | "shared" | string;
  word_count: number;
  title: string;
  preview: string;
  updated_at?: string | null;
}

interface DashboardRecentPost {
  id: string;
  type: "article" | "kanban" | string;
  title: string;
  preview: string;
  updated_at?: string | null;
  project_id?: string | null;
}

interface DashboardRecentLog {
  id: string;
  log_date: string;
  status: string;
  word_count: number;
  title: string;
  preview: string;
  updated_at?: string | null;
}

interface DashboardData {
  profile: {
    id: string;
    display_name: string;
    avatar_url?: string | null;
    member_color?: string | null;
    status_message?: string | null;
    banner_text?: string | null;
    cache_bust_version?: string | null;
  };
  continue_writing: {
    href: string;
    label: string;
    has_draft: boolean;
  };
  notification_summary: {
    unread_total: number;
    categories: {
      comments: number;
      replies: number;
      reactions: number;
      mentions: number;
      system: number;
      other: number;
    };
  };
  drafts: {
    daily_logs: DashboardDraftLog[];
  };
  recent: {
    daily_logs: DashboardRecentLog[];
    posts: DashboardRecentPost[];
  };
  stats: {
    notes_count: number;
    posts_count: number;
    comments_count: number;
    bookmarks_count: number;
  };
  preferences?: {
    home_widgets?: {
      show_continue_writing?: boolean;
      show_drafts?: boolean;
      show_notification_summary?: boolean;
      show_recent_activity?: boolean;
    };
  };
}

interface ActivityRow {
  id: string;
  action: string;
  target_type: string;
  target_id: string;
  target_title?: string;
  target_link?: string;
  created_at?: string;
  project_name?: string | null;
  actor?: {
    id?: string;
    display_name?: string;
    avatar_url?: string | null;
    member_color?: string | null;
  };
}

const ACTION_LABEL: Record<string, string> = {
  created_article: "shared a doc",
  created_kanban_card: "posted an update",
  created_research_note: "wrote a note",
  added_comment: "left a comment",
  created_schedule_event: "scheduled work",
};

function toPathFromPost(post: DashboardRecentPost): string {
  if (post.type === "article") return `/shared/articles/${post.id}`;
  return `/shared/feed/${post.id}`;
}

function toPathFromActivity(row: ActivityRow): string {
  if (row.target_link && row.target_link.trim()) return row.target_link;
  if (row.target_type === "research_note") return `/research-notes/${row.target_id}`;
  if (row.target_type === "shared_post") {
    return row.action === "created_kanban_card"
      ? `/shared/feed/${row.target_id}`
      : `/shared/articles/${row.target_id}`;
  }
  if (row.target_type === "daily_log") return "/daily-log/archive";
  if (row.target_type === "schedule_event") return "/schedule";
  return "/home";
}

function formatWhen(value?: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div className="rounded-[24px] border border-black/[0.08] bg-white/85 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{value}</p>
      <p className="mt-1 text-sm text-text-secondary">{hint}</p>
    </div>
  );
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">{title}</p>
        <p className="mt-2 text-sm text-text-secondary">{description}</p>
      </div>
      {action}
    </div>
  );
}

export default function HomeDashboardPage() {
  const { currentProjectId, projects } = useProjectStore();
  const siteConfig = useSiteConfigStore((state) => state.config);

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [activityRows, setActivityRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [dashboardRes, activityRes] = await Promise.all([
          api.get("/users/me/dashboard", {
            params: {
              project_id: currentProjectId ?? undefined,
              limit: 6,
            },
          }),
          api.get("/activity", { params: { limit: 8 } }).catch(() => ({ data: { data: [] } })),
        ]);

        if (!mounted) return;
        setDashboard((dashboardRes.data?.data ?? null) as DashboardData | null);
        setActivityRows((activityRes.data?.data ?? []) as ActivityRow[]);
      } catch {
        if (!mounted) return;
        setDashboard(null);
        setActivityRows([]);
        setError("Failed to load your workspace snapshot.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [currentProjectId]);

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
      }),
    []
  );

  const projectName = useMemo(
    () => projects.find((project) => project.id === currentProjectId)?.name ?? null,
    [currentProjectId, projects]
  );

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-black/10 border-t-primary-500" />
      </div>
    );
  }

  if (error || !dashboard) {
    return <p className="text-sm text-red-500">{error ?? "Failed to load your workspace snapshot."}</p>;
  }

  const widgetPrefs = dashboard.preferences?.home_widgets;
  const showContinue = widgetPrefs?.show_continue_writing ?? true;
  const showDrafts = widgetPrefs?.show_drafts ?? true;
  const showNotificationSummary = widgetPrefs?.show_notification_summary ?? true;
  const showRecentActivity = widgetPrefs?.show_recent_activity ?? true;

  const inboxCategories = dashboard.notification_summary.categories;
  const unread = dashboard.notification_summary.unread_total;
  const focusLabel = dashboard.continue_writing.has_draft ? "Resume draft" : "Start the next piece";

  return (
    <div className="space-y-5">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.2fr)_360px]">
          <div className="border-b border-black/[0.06] px-6 py-6 lg:border-b-0 lg:border-r">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Workspace hub</p>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-[620px]">
                <h1 className="text-[32px] font-semibold tracking-[-0.04em] text-text-primary md:text-[42px]">
                  Keep the work legible,
                  <br />
                  and the team aligned.
                </h1>
                <p className="mt-4 text-base leading-7 text-text-secondary">
                  {todayLabel}
                  {" · "}
                  {projectName ? `${projectName} project space` : "Personal workspace"}
                </p>
                <p className="mt-3 max-w-[560px] text-sm leading-7 text-text-secondary">
                  {dashboard.profile.banner_text?.trim()
                    ? dashboard.profile.banner_text
                    : "Start from the journal, turn the signal into notes, and share only when the work is ready."}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <UserAvatar
                  displayName={dashboard.profile.display_name}
                  avatarUrl={dashboard.profile.avatar_url}
                  userId={dashboard.profile.id}
                  memberColor={dashboard.profile.member_color}
                  className="h-12 w-12 text-xs"
                  alt="Workspace owner avatar"
                />
                <div>
                  <p className="text-sm font-medium text-text-primary">{dashboard.profile.display_name}</p>
                  <p className="text-xs text-text-muted">
                    {dashboard.profile.status_message?.trim() || "Research is moving."}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link
                href={dashboard.continue_writing.href}
                className="rounded-full bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"
              >
                {focusLabel}
              </Link>
              <Link
                href="/daily-log"
                className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
              >
                Open journal
              </Link>
              <Link
                href="/shared"
                className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
              >
                Open team space
              </Link>
            </div>
          </div>

          <div className="grid gap-[1px] bg-black/[0.06]">
            <div className="grid gap-[1px] sm:grid-cols-2">
              <div className="bg-white/84 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Inbox</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-text-primary">{unread}</p>
                <p className="mt-1 text-sm text-text-secondary">Unread signals waiting for a decision</p>
              </div>
              <div className="bg-white/84 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Notes</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-text-primary">{dashboard.stats.notes_count}</p>
                <p className="mt-1 text-sm text-text-secondary">Active research documents in your workspace</p>
              </div>
            </div>
            <div className="grid gap-[1px] sm:grid-cols-2">
              <div className="bg-white/84 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Shared</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-text-primary">{dashboard.stats.posts_count}</p>
                <p className="mt-1 text-sm text-text-secondary">Docs and updates shared with the team</p>
              </div>
              <div className="bg-white/84 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Comments</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-text-primary">{dashboard.stats.comments_count}</p>
                <p className="mt-1 text-sm text-text-secondary">Conversation attached to the work itself</p>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <GlassCard className="space-y-4">
            <SectionHeader
              title={siteConfig.home.quick_actions.title}
              description="Choose the smallest useful format, then keep momentum."
            />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Link
                href="/daily-log"
                className="rounded-[24px] border border-primary-300/45 bg-primary-500/8 px-4 py-4 transition-colors hover:bg-primary-500/14"
              >
                <p className="text-sm font-medium text-text-primary">Daily log</p>
                <p className="mt-1 text-sm text-text-secondary">Capture today before it turns fuzzy.</p>
              </Link>
              <Link
                href="/research-notes/new"
                className="rounded-[24px] border border-black/[0.08] bg-white/82 px-4 py-4 transition-colors hover:bg-white"
              >
                <p className="text-sm font-medium text-text-primary">{siteConfig.home.quick_actions.new_note_label}</p>
                <p className="mt-1 text-sm text-text-secondary">Long-form thinking with retrieval assist.</p>
              </Link>
              <Link
                href="/shared/new?type=article"
                className="rounded-[24px] border border-black/[0.08] bg-white/82 px-4 py-4 transition-colors hover:bg-white"
              >
                <p className="text-sm font-medium text-text-primary">{siteConfig.home.quick_actions.share_article_label}</p>
                <p className="mt-1 text-sm text-text-secondary">Write a doc the team can reference later.</p>
              </Link>
              <Link
                href="/shared/feed"
                className="rounded-[24px] border border-black/[0.08] bg-white/82 px-4 py-4 transition-colors hover:bg-white"
              >
                <p className="text-sm font-medium text-text-primary">{siteConfig.home.quick_actions.open_feed_label}</p>
                <p className="mt-1 text-sm text-text-secondary">Scan quick updates without leaving the project.</p>
              </Link>
            </div>
          </GlassCard>

          {showContinue && (
            <GlassCard className="space-y-4">
              <SectionHeader
                title="Continue"
                description={dashboard.continue_writing.label}
                action={
                  <Link
                    href={dashboard.continue_writing.href}
                    className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black/85"
                  >
                    Resume
                  </Link>
                }
              />
              <div className="grid gap-3 md:grid-cols-3">
                <StatCard label="Mode" value={dashboard.continue_writing.has_draft ? "Draft" : "Fresh"} hint="Lumen keeps your next step visible." />
                <StatCard label="Project" value={projectName ?? "Personal"} hint="Writing stays tied to the right context." />
                <StatCard label="Last step" value={dashboard.continue_writing.has_draft ? "Open" : "Ready"} hint="Jump back in without hunting for the page." />
              </div>
            </GlassCard>
          )}

          <GlassCard className="space-y-4">
            <SectionHeader
              title="Recent work"
              description="The freshest docs and journal entries in your current workspace."
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-[24px] border border-black/[0.08] bg-white/78 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-text-primary">Team docs and updates</p>
                  <Link href="/shared" className="text-xs text-primary-600 hover:underline">
                    Open
                  </Link>
                </div>
                <div className="mt-3 space-y-2">
                  {dashboard.recent.posts.length === 0 ? (
                    <p className="text-sm text-text-muted">Nothing shared yet.</p>
                  ) : (
                    dashboard.recent.posts.map((post) => (
                      <Link
                        key={post.id}
                        href={toPathFromPost(post)}
                        className="block rounded-2xl border border-black/[0.06] bg-white px-3 py-3 transition-colors hover:bg-black/[0.02]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="line-clamp-1 text-sm font-medium text-text-primary">{post.title}</p>
                          <span className="rounded-full bg-black/[0.04] px-2 py-1 text-[10px] font-medium text-text-secondary">
                            {post.type === "article" ? "Doc" : "Update"}
                          </span>
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-sm text-text-secondary">
                          {post.preview || "No preview available yet."}
                        </p>
                        <p className="mt-2 text-xs text-text-muted">{formatWhen(post.updated_at)}</p>
                      </Link>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-black/[0.08] bg-white/78 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-text-primary">Journal</p>
                  <Link href="/daily-log/archive" className="text-xs text-primary-600 hover:underline">
                    Archive
                  </Link>
                </div>
                <div className="mt-3 space-y-2">
                  {dashboard.recent.daily_logs.length === 0 ? (
                    <p className="text-sm text-text-muted">No recent journal entries.</p>
                  ) : (
                    dashboard.recent.daily_logs.map((log) => (
                      <Link
                        key={log.id}
                        href={`/daily-log?date=${log.log_date}`}
                        className="block rounded-2xl border border-black/[0.06] bg-white px-3 py-3 transition-colors hover:bg-black/[0.02]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="line-clamp-1 text-sm font-medium text-text-primary">{log.title}</p>
                          <span className="rounded-full bg-black/[0.04] px-2 py-1 text-[10px] font-medium text-text-secondary">
                            {log.status}
                          </span>
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-sm text-text-secondary">
                          {log.preview || "No preview available yet."}
                        </p>
                        <p className="mt-2 text-xs text-text-muted">
                          {log.log_date} · {log.word_count} words
                        </p>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </div>
          </GlassCard>

          {showDrafts && (
            <GlassCard className="space-y-4">
              <SectionHeader
                title="Draft shelf"
                description="Half-finished work that should remain one click away."
              />
              {dashboard.drafts.daily_logs.length === 0 ? (
                <p className="text-sm text-text-muted">No open drafts in the journal right now.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {dashboard.drafts.daily_logs.map((row) => (
                    <Link
                      key={row.id}
                      href={`/daily-log?date=${row.log_date}`}
                      className="rounded-[24px] border border-black/[0.08] bg-white/82 px-4 py-4 transition-colors hover:bg-white"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="line-clamp-1 text-sm font-medium text-text-primary">
                          {row.title || "Untitled daily log"}
                        </p>
                        <span className="rounded-full bg-primary-500/10 px-2 py-1 text-[10px] font-medium text-primary-700">
                          {row.status}
                        </span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-sm text-text-secondary">
                        {row.preview || "No preview available yet."}
                      </p>
                      <p className="mt-2 text-xs text-text-muted">
                        {row.log_date} · {row.word_count} words · {formatWhen(row.updated_at)}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </GlassCard>
          )}
        </div>

        <div className="space-y-5">
          {showNotificationSummary && (
            <GlassCard className="space-y-4">
              <SectionHeader
                title="Inbox snapshot"
                description="What needs attention before the day gets noisy."
                action={
                  <Link href="/notifications" className="text-xs font-medium text-primary-600 hover:underline">
                    Open inbox
                  </Link>
                }
              />
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-[22px] border border-black/[0.08] bg-white/82 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Unread</p>
                  <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-text-primary">{unread}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-2">
                  <div className="rounded-2xl border border-black/[0.06] bg-white px-3 py-3 text-sm text-text-secondary">
                    Comments <span className="float-right font-medium text-text-primary">{inboxCategories.comments}</span>
                  </div>
                  <div className="rounded-2xl border border-black/[0.06] bg-white px-3 py-3 text-sm text-text-secondary">
                    Replies <span className="float-right font-medium text-text-primary">{inboxCategories.replies}</span>
                  </div>
                  <div className="rounded-2xl border border-black/[0.06] bg-white px-3 py-3 text-sm text-text-secondary">
                    Reactions <span className="float-right font-medium text-text-primary">{inboxCategories.reactions}</span>
                  </div>
                  <div className="rounded-2xl border border-black/[0.06] bg-white px-3 py-3 text-sm text-text-secondary">
                    Mentions <span className="float-right font-medium text-text-primary">{inboxCategories.mentions}</span>
                  </div>
                </div>
              </div>
            </GlassCard>
          )}

          {showRecentActivity && (
            <GlassCard className="space-y-4">
              <SectionHeader
                title="Team pulse"
                description="Recent signals from the people sharing this workspace."
              />
              {activityRows.length === 0 ? (
                <p className="text-sm text-text-muted">No recent team activity yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {activityRows.map((row) => (
                    <Link
                      key={row.id}
                      href={toPathFromActivity(row)}
                      className="block rounded-[22px] border border-black/[0.08] bg-white/84 px-4 py-3 transition-colors hover:bg-white"
                    >
                      <div className="flex items-start gap-3">
                        <UserAvatar
                          displayName={row.actor?.display_name}
                          avatarUrl={row.actor?.avatar_url}
                          userId={row.actor?.id}
                          memberColor={row.actor?.member_color}
                          className="h-9 w-9 shrink-0 text-[10px]"
                          alt=""
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-text-primary">
                              {row.actor?.display_name || "Unknown"}
                            </p>
                            <span className="text-xs text-text-muted">
                              {ACTION_LABEL[row.action] || row.action}
                            </span>
                            {row.project_name ? (
                              <span className="rounded-full bg-black/[0.04] px-2 py-1 text-[10px] font-medium text-text-secondary">
                                {row.project_name}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-text-secondary">
                            {row.target_title || "Untitled"}
                          </p>
                          <p className="mt-2 text-xs text-text-muted">{formatWhen(row.created_at)}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}
