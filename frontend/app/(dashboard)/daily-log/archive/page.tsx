"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";

interface Row {
  id: string;
  log_date: string;
  title?: string;
  word_count: number;
  preview: string;
  updated_at?: string;
  status?: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  private: "Private",
  shared: "Shared",
};

const STATUS_TONE: Record<string, string> = {
  draft: "border-amber-200/80 bg-amber-50 text-amber-700",
  private: "border-black/10 bg-black/[0.04] text-text-muted",
  shared: "border-blue-200/80 bg-blue-50 text-blue-700",
};

function formatWhen(value?: string): string {
  if (!value) return "Recently updated";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DailyLogArchivePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "private" | "shared">("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get("/daily-logs", { params: { limit: 100 } });
        if (!mounted) return;
        setRows(res.data?.data ?? []);
      } catch {
        if (!mounted) return;
        setRows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      if (!matchesStatus) return false;
      if (!normalizedQuery) return true;

      const haystack = `${row.title ?? ""} ${row.preview ?? ""} ${row.log_date}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [query, rows, statusFilter]);

  const stats = useMemo(
    () => ({
      total: rows.length,
      shared: rows.filter((row) => row.status === "shared").length,
      drafts: rows.filter((row) => row.status === "draft").length,
      private: rows.filter((row) => row.status === "private").length,
    }),
    [rows],
  );

  const handleDeleteRow = async (event: MouseEvent<HTMLButtonElement>, row: Row) => {
    event.preventDefault();
    event.stopPropagation();

    if (deletingId) return;
    const label = row.title?.trim() || `${row.log_date} log`;
    if (!window.confirm(`Delete "${label}"?`)) return;

    setDeletingId(row.id);
    try {
      await api.delete(`/daily-logs/${row.id}`);
      setRows((prev) => prev.filter((item) => item.id !== row.id));
    } catch {
      window.alert("Delete failed. Try again.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="bg-white/88 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Journal archive</p>
            <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-text-primary md:text-[38px]">
              Browse past logs,
              <br />
              then reopen the right day fast.
            </h1>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-text-secondary">
              Use the archive to scan drafts, private notes, and shared entries without opening each log one by one.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link
                href="/daily-log"
                className="rounded-[12px] bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"
              >
                Open today
              </Link>
            </div>
          </div>

          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-2 lg:grid-cols-1">
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Total logs</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{stats.total}</p>
              <p className="mt-1 text-sm text-text-secondary">All saved daily entries in your workspace.</p>
            </div>
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Shared</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{stats.shared}</p>
              <p className="mt-1 text-sm text-text-secondary">
                {stats.drafts} drafts and {stats.private} private logs remain in progress.
              </p>
            </div>
          </div>
        </div>
      </GlassCard>

      {!loading && rows.length > 0 ? (
        <GlassCard className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 flex-1">
              <label className="mb-2 block text-sm font-medium text-text-primary">Search logs</label>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by title, preview, or date"
                className="input w-full md:max-w-md"
              />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-text-primary">Status</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "all", label: "All" },
                  { key: "draft", label: "Draft" },
                  { key: "private", label: "Private" },
                  { key: "shared", label: "Shared" },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setStatusFilter(item.key as typeof statusFilter)}
                    className={`rounded-[12px] border px-3 py-1.5 text-xs font-medium transition-colors ${
                      statusFilter === item.key
                        ? "border-primary-300 bg-primary-50 text-primary-700"
                        : "border-black/10 bg-white text-text-secondary hover:bg-black/[0.03] hover:text-text-primary"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </GlassCard>
      ) : null}

      {loading ? (
        <ListSkeleton />
      ) : filteredRows.length === 0 ? (
        <GlassCard>
          <p className="text-sm text-text-muted">
            {rows.length === 0 ? "No saved logs yet." : "No logs match the current filters."}
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {filteredRows.map((row) => (
            <Link key={row.id} href={`/daily-log/${row.log_date}`} className="block">
              <GlassCard className="workspace-row px-5 py-4 transition-colors hover:bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-base font-semibold text-text-primary">
                        {row.title?.trim() || `${row.log_date} log`}
                      </p>
                      {row.status ? (
                        <span
                          className={`rounded-[10px] border px-2 py-0.5 text-[10px] font-medium ${
                            STATUS_TONE[row.status] ?? STATUS_TONE.draft
                          }`}
                        >
                          {STATUS_LABEL[row.status] ?? row.status}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-text-muted">
                      {row.log_date} - {row.word_count} words - {formatWhen(row.updated_at)}
                    </p>
                    <p className="mt-2 line-clamp-3 text-sm text-text-secondary">
                      {row.preview || "No preview saved yet."}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={(event) => void handleDeleteRow(event, row)}
                    disabled={deletingId === row.id}
                    className="rounded-[10px] border border-red-200/80 bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
                  >
                    {deletingId === row.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
