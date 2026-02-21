"use client";

import { FormEvent, useEffect, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { api } from "@/lib/api";

interface EventRow {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  location?: string;
}

function toLocalInputDateTime(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function SchedulePage() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState(toLocalInputDateTime(new Date()));
  const [endTime, setEndTime] = useState(toLocalInputDateTime(new Date(Date.now() + 60 * 60 * 1000)));
  const [location, setLocation] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const to = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
      const res = await api.get("/schedule", {
        params: {
          from: now.toISOString(),
          to: to.toISOString(),
        },
      });
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

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setCreating(true);
    try {
      await api.post("/schedule", {
        title: title.trim(),
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        location: location || null,
        attendee_ids: [],
        tag_ids: [],
      });
      setTitle("");
      await load();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Schedule</h1>

      <GlassCard>
        <form onSubmit={onCreate} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input className="input md:col-span-2" placeholder="이벤트 제목" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input" type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <input className="input" type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          <input className="input md:col-span-2" placeholder="위치 (선택)" value={location} onChange={(e) => setLocation(e.target.value)} />
          <div className="md:col-span-2">
            <button className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={creating}>
              {creating ? "Creating..." : "Add Event"}
            </button>
          </div>
        </form>
      </GlassCard>

      {loading ? (
        <p className="text-sm text-white/60">불러오는 중...</p>
      ) : rows.length === 0 ? (
        <GlassCard><p className="text-sm text-white/60">예정된 이벤트가 없습니다.</p></GlassCard>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <GlassCard key={row.id}>
              <h3 className="font-semibold">{row.title}</h3>
              <p className="mt-1 text-xs text-white/50">
                {new Date(row.start_time).toLocaleString()} ~ {new Date(row.end_time).toLocaleString()}
              </p>
              {row.location && <p className="mt-1 text-sm text-white/70">📍 {row.location}</p>}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
