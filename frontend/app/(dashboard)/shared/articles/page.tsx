"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { api } from "@/lib/api";
import { useProjectStore } from "@/store/project";

interface SharedArticle {
  id: string;
  title: string;
  preview: string;
  updated_at?: string;
  view_count: number;
}

export default function SharedArticlesPage() {
  const { currentProjectId } = useProjectStore();
  const [rows, setRows] = useState<SharedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/shared-posts", {
        params: { type: "article", limit: 100, project_id: currentProjectId ?? undefined },
      });
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [currentProjectId]);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("이 아티클을 삭제하시겠습니까?")) return;
    setDeletingId(id);
    try {
      await api.delete(`/shared-posts/${id}`);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch {
      alert("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">Shared Articles</h1>
        <Link href="/shared/new" className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors">
          + New
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-text-muted">불러오는 중...</p>
      ) : rows.length === 0 ? (
        <GlassCard><p className="text-sm text-text-muted">{currentProjectId ? "이 프로젝트에 아직 아티클이 없습니다." : "Personal Space에 아티클이 없습니다."}</p></GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {rows.map((row) => (
            <div key={row.id} className="group relative">
              <Link href={`/shared/articles/${row.id}`}>
                <GlassCard variant="interactive">
                  <h3 className="text-base font-semibold text-text-primary pr-8">{row.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm text-text-muted">{row.preview}</p>
                  <p className="mt-3 text-xs text-text-muted">👁 {row.view_count}</p>
                </GlassCard>
              </Link>
              {/* Delete button — outside Link to avoid navigation */}
              <button
                onClick={(e) => void handleDelete(e, row.id)}
                disabled={deletingId === row.id}
                title="삭제"
                className="absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-xs text-red-400 opacity-0 shadow-sm transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 disabled:opacity-50"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
