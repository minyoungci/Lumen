"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";

interface Row {
  id: string;
  log_date: string;
  word_count: number;
  preview: string;
  updated_at?: string;
  status?: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft:   "임시저장",
  private: "개인보관",
  shared:  "팀공유",
};
const STATUS_COLOR: Record<string, string> = {
  draft:   "bg-amber-50 text-amber-600 border-amber-200/60",
  private: "bg-black/[0.04] text-text-muted border-black/10",
  shared:  "bg-blue-50 text-blue-600 border-blue-200/60",
};

export default function DailyLogArchivePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await api.get("/daily-logs", { params: { limit: 100 } });
        if (mounted) setRows(res.data?.data ?? []);
      } catch {
        if (mounted) setRows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Log Archive</h1>
          <p className="text-sm text-text-muted">저장된 Daily Log 목록</p>
        </div>
        <Link
          href="/daily-log"
          className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors"
        >
          + 오늘 로그
        </Link>
      </div>

      {loading ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <GlassCard>
          <p className="text-sm text-text-muted">저장된 로그가 없습니다.</p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Link key={row.id} href={`/daily-log/${row.log_date}`}>
              <GlassCard variant="interactive">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-text-primary">{row.log_date}</p>
                  <div className="flex items-center gap-2">
                    {row.status && (
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_COLOR[row.status] ?? STATUS_COLOR.draft}`}>
                        {STATUS_LABEL[row.status] ?? row.status}
                      </span>
                    )}
                    <span className="text-xs text-text-muted">{row.word_count} words</span>
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-text-muted">{row.preview}</p>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
