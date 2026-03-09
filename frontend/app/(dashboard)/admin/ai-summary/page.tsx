"use client";

import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { api } from "@/lib/api";

interface SummaryRow {
  id: string;
  user_id: string;
  summary_date: string;
  period: string;
  summary_text: string;
  key_topics: string[];
  model_used: string;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminAiSummaryPage() {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await api.get("/admin/ai-summaries", { params: { limit: 30 } });
      const nextRows = response.data?.data ?? [];
      setRows(nextRows);
      setSelectedUserId((current) => current || nextRows[0]?.user_id || "");
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const uniqueUserIds = useMemo(() => Array.from(new Set(rows.map((row) => row.user_id))), [rows]);
  const latestDate = rows[0]?.summary_date ? formatDate(rows[0].summary_date) : "None yet";

  const onGenerate = async () => {
    const targetUserId = selectedUserId || rows[0]?.user_id;
    if (!targetUserId) return;

    setGenerating(true);
    try {
      await api.post("/admin/ai-summaries/generate", { user_id: targetUserId, period: "daily" });
      await load();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-5">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="bg-white/88 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">AI summaries</p>
            <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-text-primary md:text-[38px]">
              Review generated summaries,
              <br />
              then regenerate with intent.
            </h1>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-text-secondary">
              This surface is for reading what the system produced, checking topical coverage, and rerunning summary
              generation for a user when the output needs another pass.
            </p>
          </div>

          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-3 lg:grid-cols-1">
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Loaded</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{rows.length}</p>
              <p className="mt-1 text-sm text-text-secondary">Recent summary records currently displayed.</p>
            </div>
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Users</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{uniqueUserIds.length}</p>
              <p className="mt-1 text-sm text-text-secondary">Distinct users represented in this list.</p>
            </div>
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Latest</p>
              <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-text-primary">{latestDate}</p>
              <p className="mt-1 text-sm text-text-secondary">Most recent generated summary in the feed.</p>
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-primary">Generate for user</label>
            <select
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              className="input w-[260px]"
              disabled={rows.length === 0}
            >
              {uniqueUserIds.map((userId) => (
                <option key={userId} value={userId}>
                  {userId}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={onGenerate}
            disabled={generating || rows.length === 0}
            className="rounded-full bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
          >
            {generating ? "Generating..." : "Generate daily summary"}
          </button>
        </div>
      </GlassCard>

      {loading ? (
        <GlassCard>
          <p className="text-sm text-text-muted">Loading summaries...</p>
        </GlassCard>
      ) : rows.length === 0 ? (
        <GlassCard>
          <p className="text-sm font-medium text-text-primary">No summaries yet.</p>
          <p className="mt-1 text-sm text-text-secondary">Generate the first one after user activity exists.</p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <GlassCard key={row.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                    {row.period} summary
                  </p>
                  <h2 className="mt-2 text-base font-semibold text-text-primary">{formatDate(row.summary_date)}</h2>
                  <p className="mt-1 text-xs text-text-muted">User {row.user_id}</p>
                </div>
                <span className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-[10px] font-medium text-text-muted">
                  {row.model_used}
                </span>
              </div>

              {row.key_topics.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {row.key_topics.map((topic) => (
                    <span
                      key={`${row.id}-${topic}`}
                      className="rounded-full border border-primary-300/50 bg-primary-500/10 px-2 py-0.5 text-[10px] font-medium text-primary-700"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              ) : null}

              <p className="mt-4 text-sm leading-7 text-text-secondary">{row.summary_text}</p>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
