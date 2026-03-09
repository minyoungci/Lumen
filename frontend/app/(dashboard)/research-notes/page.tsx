"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { api } from "@/lib/api";
import { useProjectStore } from "@/store/project";

interface NoteRow {
  id: string;
  title: string;
  preview: string;
  is_shared: boolean;
  is_pinned: boolean;
  word_count: number;
  reading_time: number;
  updated_at?: string;
}

function formatWhen(value?: string) {
  if (!value) return "Recently";
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ResearchNotesPage() {
  const { currentProjectId, projects } = useProjectStore();
  const [rows, setRows] = useState<NoteRow[]>([]);
  const [scope, setScope] = useState<"mine" | "shared">("mine");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get("/research-notes", {
          params: {
            scope,
            search: search.trim() || undefined,
            limit: 50,
            project_id: currentProjectId ?? undefined,
          },
        });
        if (mounted) setRows((res.data?.data ?? []) as NoteRow[]);
      } catch {
        if (mounted) setRows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }, 220);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [scope, search, currentProjectId]);

  const projectName = useMemo(
    () => projects.find((project) => project.id === currentProjectId)?.name ?? null,
    [currentProjectId, projects]
  );

  const sharedCount = rows.filter((row) => row.is_shared).length;
  const pinnedCount = rows.filter((row) => row.is_pinned).length;

  return (
    <div className="space-y-5">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="bg-white/88 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Notes</p>
            <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-text-primary md:text-[38px]">
              Working knowledge,
              <br />
              without losing the thread.
            </h1>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-text-secondary">
              {projectName
                ? `${projectName} is the active project. Use notes for structured thinking, references, and work that should stay editable before it becomes a team doc.`
                : "You are in Personal workspace. Notes stay flexible here until they are ready to share into the team space."}
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link
                href="/research-notes/new"
                className="rounded-full bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"
              >
                New note
              </Link>
              <Link
                href="/shared/articles"
                className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
              >
                Open team docs
              </Link>
            </div>
          </div>

          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-3 lg:grid-cols-1">
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Visible notes</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{rows.length}</p>
              <p className="mt-1 text-sm text-text-secondary">Filtered by the current scope and search term.</p>
            </div>
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Shared</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{sharedCount}</p>
              <p className="mt-1 text-sm text-text-secondary">Notes that are already visible to collaborators.</p>
            </div>
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Pinned</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{pinnedCount}</p>
              <p className="mt-1 text-sm text-text-secondary">Items you have marked for quick return.</p>
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: "mine" as const, label: "My notes" },
              { key: "shared" as const, label: "Shared notes" },
            ].map((option) => (
              <button
                key={option.key}
                onClick={() => setScope(option.key)}
                className={`rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
                  scope === option.key
                    ? "border-primary-500/40 bg-primary-500/10 text-primary-700"
                    : "border-black/10 bg-white text-text-secondary hover:bg-black/[0.03] hover:text-text-primary"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search note titles"
            className="input w-full max-w-[320px]"
          />
        </div>
      </GlassCard>

      {loading ? (
        <GlassCard>
          <p className="text-sm text-text-muted">Loading notes...</p>
        </GlassCard>
      ) : rows.length === 0 ? (
        <GlassCard>
          <p className="text-sm text-text-primary">No notes found.</p>
          <p className="mt-1 text-sm text-text-secondary">
            {currentProjectId
              ? "Start a note when the work needs structure before it becomes a document."
              : "Start a note in Personal workspace to keep draft thinking legible."}
          </p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <Link key={row.id} href={`/research-notes/${row.id}`}>
              <GlassCard variant="interactive" className="h-full">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        row.is_shared
                          ? "border border-primary-300/50 bg-primary-500/10 text-primary-700"
                          : "border border-black/10 bg-white text-text-secondary"
                      }`}
                    >
                      {row.is_shared ? "Shared" : "Private"}
                    </span>
                    {row.is_pinned ? (
                      <span className="rounded-full border border-amber-300/50 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        Pinned
                      </span>
                    ) : null}
                  </div>
                  <span className="text-[11px] text-text-muted">{formatWhen(row.updated_at)}</span>
                </div>

                <h3 className="mt-3 line-clamp-2 text-base font-semibold text-text-primary">
                  {row.title || "Untitled note"}
                </h3>
                <p className="mt-2 line-clamp-3 text-sm text-text-secondary">
                  {row.preview || "No preview yet."}
                </p>

                <div className="mt-4 flex items-center justify-between text-xs text-text-muted">
                  <span>{row.word_count || 0} words</span>
                  <span>{row.reading_time || 0} min read</span>
                </div>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
