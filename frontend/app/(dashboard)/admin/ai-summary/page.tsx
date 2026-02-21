"use client";

import { useEffect, useState } from "react";
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

export default function AdminAiSummaryPage() {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/ai-summaries", { params: { limit: 30 } });
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onGenerate = async () => {
    if (rows.length === 0) return;
    setGenerating(true);
    try {
      await api.post("/admin/ai-summaries/generate", { user_id: rows[0].user_id, period: "daily" });
      await load();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">AI Summaries</h1>
        <button onClick={onGenerate} disabled={generating || rows.length === 0} className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {generating ? "Generating..." : "Generate"}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-white/60">불러오는 중...</p>
      ) : rows.length === 0 ? (
        <GlassCard><p className="text-sm text-white/60">요약 데이터가 없습니다.</p></GlassCard>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <GlassCard key={row.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-white/50">{new Date(row.summary_date).toLocaleString()}</p>
                  <h3 className="mt-1 text-base font-semibold">{row.period} summary</h3>
                </div>
                <p className="text-xs text-white/50">{row.model_used}</p>
              </div>
              <p className="mt-3 text-sm text-white/80">{row.summary_text}</p>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
