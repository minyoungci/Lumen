"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

export default function ResearchNotesPage() {
  const { currentProjectId } = useProjectStore();
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
        if (mounted) setRows(res.data?.data ?? []);
      } catch {
        if (mounted) setRows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }, 250);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [scope, search, currentProjectId]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Research Notes</h1>
          <p className="text-sm text-white/60">연구 노트를 작성하고 공유하세요.</p>
        </div>
        <Link href="/research-notes/new" className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white">
          + New Note
        </Link>
      </div>

      <GlassCard className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setScope("mine")}
            className={`rounded-lg px-3 py-1.5 text-sm ${scope === "mine" ? "bg-white/20" : "bg-white/5"}`}
          >
            My Notes
          </button>
          <button
            onClick={() => setScope("shared")}
            className={`rounded-lg px-3 py-1.5 text-sm ${scope === "shared" ? "bg-white/20" : "bg-white/5"}`}
          >
            Shared
          </button>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="제목 검색"
            className="input ml-auto w-full max-w-[260px]"
          />
        </div>
      </GlassCard>

      {loading ? (
        <div className="text-sm text-white/60">불러오는 중...</div>
      ) : rows.length === 0 ? (
        <GlassCard>
          <p className="text-sm text-white/60">{currentProjectId ? "이 프로젝트에 아직 노트가 없습니다." : "Personal Space에 노트가 없습니다."}</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <Link key={row.id} href={`/research-notes/${row.id}`}>
              <GlassCard variant="interactive" className="h-full">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-base font-semibold">{row.title}</h3>
                  {row.is_pinned && <span className="text-xs">📌</span>}
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-white/60">{row.preview || "(내용 없음)"}</p>
                <div className="mt-4 flex items-center justify-between text-xs text-white/50">
                  <span>{row.reading_time || 0} min read</span>
                  <span>{row.is_shared ? "Shared" : "Private"}</span>
                </div>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
