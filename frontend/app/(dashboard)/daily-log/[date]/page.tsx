"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { GlassCard } from "@/components/shared/GlassCard";
import { api } from "@/lib/api";

export default function DailyLogByDatePage() {
  const { date } = useParams<{ date: string }>();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    if (!date) return;

    const load = async () => {
      try {
        const res = await api.get(`/daily-logs/${date}`);
        const raw = res.data?.data?.content;
        const content = typeof raw?.text === "string" ? raw.text : "";
        if (mounted) setText(content);
      } catch {
        if (mounted) setText("");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [date]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Daily Log · {date}</h1>
        <div className="flex items-center gap-2">
          <Link href="/daily-log" className="rounded-lg border border-white/10 px-3 py-2 text-sm">Today</Link>
          <Link href="/daily-log/archive" className="rounded-lg border border-white/10 px-3 py-2 text-sm">Archive</Link>
        </div>
      </div>

      <GlassCard>
        {loading ? (
          <p className="text-sm text-white/60">불러오는 중...</p>
        ) : (
          <pre className="whitespace-pre-wrap text-sm text-white/80">{text || "(내용 없음)"}</pre>
        )}
      </GlassCard>
    </div>
  );
}
