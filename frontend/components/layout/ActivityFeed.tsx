"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { useSidebarStore } from "@/store/sidebar";

interface ActivityRow {
  id: string;
  action: string;
  target_title?: string;
  created_at?: string;
  actor?: { display_name?: string };
}

export function ActivityFeed() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const { isActivityOpen, toggleActivity } = useSidebarStore();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await api.get("/activity", { params: { limit: 20 } });
        if (mounted) setRows(res.data?.data ?? []);
      } catch {
        if (mounted) setRows([]);
      }
    };

    void load();
    const interval = window.setInterval(load, 20000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <motion.aside
      animate={{ width: isActivityOpen ? 288 : 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="fixed right-0 top-14 hidden h-[calc(100vh-56px)] overflow-hidden
                 border-l border-black/[0.06] bg-white/[0.72] backdrop-blur-[20px] xl:block"
    >
      {/* Toggle button — left edge of panel */}
      <button
        onClick={toggleActivity}
        className="absolute left-0 top-6 flex h-7 w-6 items-center justify-center
                   rounded-r-none rounded-l-md border border-black/[0.08] bg-white/90
                   text-xs text-text-muted shadow-sm hover:bg-white hover:text-text-primary
                   transition-colors -translate-x-full"
        aria-label={isActivityOpen ? "활동 피드 닫기" : "활동 피드 열기"}
      >
        {isActivityOpen ? "›" : "‹"}
      </button>

      <div className="px-4 py-6 w-72">
        <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Team Activity
        </div>
        <div className="mt-4 space-y-2.5 text-xs">
          {rows.length === 0 ? (
            <div className="py-6 text-center text-text-muted">최근 활동이 없습니다.</div>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className="rounded-lg border border-black/[0.07] bg-white/80 p-2.5"
              >
                <p className="text-text-primary">
                  <span className="font-medium">{row.actor?.display_name ?? "Unknown"}</span>
                  <span className="text-text-muted"> · {row.action}</span>
                </p>
                {row.target_title && (
                  <p className="mt-1 truncate text-text-muted">{row.target_title}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </motion.aside>
  );
}
