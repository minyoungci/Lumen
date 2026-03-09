"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { cn } from "@/lib/utils";
import { useChromeStore } from "@/store/chrome";
import { useProjectStore } from "@/store/project";
import { useSidebarStore } from "@/store/sidebar";

interface ActivityRow {
  id: string;
  action: string;
  project_id?: string | null;
  project_name?: string | null;
  target_link?: string;
  target_title?: string;
  created_at?: string;
  actor?: {
    id?: string;
    display_name?: string;
    avatar_url?: string;
    member_color?: string;
    status_message?: string;
  };
}

const ACTION_LABEL: Record<string, string> = {
  created_article: "shared a doc",
  created_kanban_card: "posted an update",
  created_research_note: "shared a note",
  created_schedule_event: "scheduled work",
  added_comment: "left a comment",
};

function formatElapsed(value?: string) {
  if (!value) return "";
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export function ActivityFeed() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrySeed, setRetrySeed] = useState(0);
  const { isActivityOpen, toggleActivity } = useSidebarStore();
  const { currentProjectId, projects } = useProjectStore();
  const { isImmersiveMode, isChromeVisible, showChrome } = useChromeStore();

  useEffect(() => {
    let mounted = true;
    let firstLoad = true;

    const load = async (silent = false) => {
      if (!silent && firstLoad && mounted) setLoading(true);
      try {
        const res = await api.get("/activity", { params: { limit: 20 } });
        if (!mounted) return;
        setRows((res.data?.data ?? []) as ActivityRow[]);
        setLoadError(null);
      } catch {
        if (!mounted) return;
        setRows([]);
        setLoadError("Could not load activity.");
      } finally {
        if (mounted && firstLoad) {
          setLoading(false);
          firstLoad = false;
        }
      }
    };

    void load();
    const interval = window.setInterval(() => void load(true), 20000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [retrySeed]);

  const scopedRows = useMemo(() => {
    if (!currentProjectId) return rows;
    return rows.filter((row) => !row.project_id || row.project_id === currentProjectId);
  }, [currentProjectId, rows]);
  const desktopVisible = isImmersiveMode ? isActivityOpen && isChromeVisible : isActivityOpen;

  return (
    <motion.aside
      initial={false}
      animate={{
        width: desktopVisible ? 288 : 0,
        x: desktopVisible ? 0 : 24,
        opacity: desktopVisible ? 1 : 0.88,
      }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      onMouseEnter={() => {
        if (isImmersiveMode) {
          showChrome();
        }
      }}
      className={cn(
        "fixed right-0 top-[68px] z-40 hidden h-[calc(100vh-68px)] overflow-hidden border-l border-black/[0.06] bg-white/[0.72] backdrop-blur-[20px] xl:block",
        isImmersiveMode && !isChromeVisible && "pointer-events-none"
      )}
    >
      <button
        onClick={toggleActivity}
        className={cn(
          "absolute left-0 top-6 flex h-7 w-6 -translate-x-full items-center justify-center rounded-l-md rounded-r-none border border-black/[0.08] bg-white/90 text-xs text-text-muted shadow-sm transition-colors hover:bg-white hover:text-text-primary",
          isImmersiveMode && !isChromeVisible && "pointer-events-none opacity-0"
        )}
        aria-label={isActivityOpen ? "Close live pulse" : "Open live pulse"}
      >
        {isActivityOpen ? "<" : ">"}
      </button>

      <div className="w-72 px-4 py-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">Live pulse</div>
            <p className="mt-1 text-[11px] text-text-muted">
              {currentProjectId
                ? projects.find((project) => project.id === currentProjectId)?.name ?? "Current project"
                : "Across your team spaces"}
            </p>
          </div>
          <Link
            href="/notifications"
            className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:bg-black/[0.03] hover:text-text-primary"
          >
            Inbox
          </Link>
        </div>

        <div className="mt-4 space-y-2.5 text-xs">
          {loading ? (
            <div className="py-6 text-center text-text-muted">Loading activity...</div>
          ) : loadError ? (
            <div className="space-y-2 py-4 text-center">
              <p className="text-text-muted">{loadError}</p>
              <button
                onClick={() => setRetrySeed((prev) => prev + 1)}
                className="rounded-lg border border-black/10 bg-white px-3 py-1 text-[11px] font-medium text-text-secondary hover:bg-black/[0.03]"
              >
                Retry
              </button>
            </div>
          ) : scopedRows.length === 0 ? (
            <div className="py-6 text-center text-text-muted">No recent team activity.</div>
          ) : (
            scopedRows.map((row) => (
              <Link
                key={row.id}
                href={row.target_link || "/home"}
                className="block rounded-[18px] border border-black/[0.07] bg-white/82 p-3 transition-colors hover:bg-white"
              >
                <div className="flex items-center gap-2">
                  <UserAvatar
                    displayName={row.actor?.display_name}
                    avatarUrl={row.actor?.avatar_url}
                    userId={row.actor?.id}
                    memberColor={row.actor?.member_color}
                    className="h-7 w-7 shrink-0 text-[10px]"
                    alt=""
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-text-primary">
                      <span className="font-medium">{row.actor?.display_name ?? "Unknown"}</span>
                      <span className="text-text-muted"> {ACTION_LABEL[row.action] ?? row.action}</span>
                    </p>
                    {row.actor?.status_message ? (
                      <p className="truncate text-[11px] text-text-muted">{row.actor.status_message}</p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[11px] text-text-muted">{row.target_title || "Untitled"}</p>
                  <span className="text-[11px] text-text-muted">{formatElapsed(row.created_at)}</span>
                </div>
                <div className="mt-1.5">
                  <span className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-[10px] text-text-muted">
                    {row.project_name ||
                      projects.find((project) => project.id === row.project_id)?.name ||
                      "Team"}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </motion.aside>
  );
}
