"use client";

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { api } from "@/lib/api";

interface Row {
  id: string;
  type: string;
  title: string;
  body?: string;
  is_read: boolean;
  created_at?: string;
  actor?: { display_name?: string };
}

export default function NotificationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/notifications", { params: { limit: 50 } });
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

  const markAll = async () => {
    await api.patch("/notifications/read-all");
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <button onClick={markAll} className="rounded-lg border border-white/10 px-3 py-2 text-sm">Mark all read</button>
      </div>

      {loading ? (
        <p className="text-sm text-white/60">불러오는 중...</p>
      ) : rows.length === 0 ? (
        <GlassCard><p className="text-sm text-white/60">알림이 없습니다.</p></GlassCard>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <GlassCard key={row.id} className={row.is_read ? "opacity-70" : ""}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{row.title}</h3>
                <span className="text-xs text-white/50">{row.type}</span>
              </div>
              {row.body && <p className="mt-2 text-sm text-white/70">{row.body}</p>}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
