"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { api } from "@/lib/api";
import { useProjectStore } from "@/store/project";

interface EventRow {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  location?: string;
}

function toLocalInputDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatRange(startTime: string, endTime: string): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return `${start.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} - ${end.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function dateKey(value: string): string {
  return new Date(value).toLocaleDateString("en-CA");
}

export default function SchedulePage() {
  const { currentProjectId } = useProjectStore();
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState(toLocalInputDateTime(new Date()));
  const [endTime, setEndTime] = useState(toLocalInputDateTime(new Date(Date.now() + 60 * 60 * 1000)));
  const [location, setLocation] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async (projectId: string | null) => {
    setLoading(true);
    try {
      const now = new Date();
      const to = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
      const res = await api.get("/schedule", {
        params: {
          from: now.toISOString(),
          to: to.toISOString(),
          project_id: projectId ?? undefined,
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
    void load(currentProjectId);
  }, [currentProjectId]);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      window.alert("Set a valid start and end time.");
      return;
    }

    setCreating(true);
    try {
      await api.post(
        "/schedule",
        {
          title: title.trim(),
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          location: location.trim() || null,
          attendee_ids: [],
          tag_ids: [],
        },
        { params: { project_id: currentProjectId ?? undefined } },
      );
      setTitle("");
      setLocation("");
      setStartTime(toLocalInputDateTime(new Date()));
      setEndTime(toLocalInputDateTime(new Date(Date.now() + 60 * 60 * 1000)));
      await load(currentProjectId);
    } finally {
      setCreating(false);
    }
  };

  const stats = useMemo(() => {
    const now = new Date();
    const weekFromNow = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
    const locations = new Set(rows.map((row) => row.location?.trim()).filter(Boolean));
    return {
      total: rows.length,
      thisWeek: rows.filter((row) => {
        const start = new Date(row.start_time);
        return start >= now && start <= weekFromNow;
      }).length,
      locations: locations.size,
      nextEvent: rows[0] ?? null,
    };
  }, [rows]);

  const groupedRows = useMemo(() => {
    const groups = new Map<string, EventRow[]>();

    [...rows]
      .sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime())
      .forEach((row) => {
        const key = dateKey(row.start_time);
        const current = groups.get(key) ?? [];
        current.push(row);
        groups.set(key, current);
      });

    return Array.from(groups.entries()).map(([key, events]) => ({
      key,
      label: new Date(events[0].start_time).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
      events,
    }));
  }, [rows]);

  return (
    <div className="space-y-5">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="bg-white/88 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Schedule</p>
            <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-text-primary md:text-[38px]">
              Plan the next month,
              <br />
              not just the next meeting.
            </h1>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-text-secondary">
              Keep upcoming meetings, reviews, and deadlines visible in one place so the team does not lose context
              between docs and live work.
            </p>
          </div>

          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-3 lg:grid-cols-1">
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Upcoming</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{stats.total}</p>
              <p className="mt-1 text-sm text-text-secondary">Events in the next 30 days.</p>
            </div>
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">This week</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{stats.thisWeek}</p>
              <p className="mt-1 text-sm text-text-secondary">Meetings and deadlines landing soonest.</p>
            </div>
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Locations</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{stats.locations}</p>
              <p className="mt-1 text-sm text-text-secondary">
                {stats.nextEvent ? `Next: ${stats.nextEvent.title}` : "No next event scheduled yet."}
              </p>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <GlassCard className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">New event</p>
            <h2 className="mt-2 text-xl font-semibold text-text-primary">Add a team checkpoint</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Keep event setup short. Title, time, and location are enough for the first pass.
            </p>
          </div>

          <form onSubmit={onCreate} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-text-primary">Title</label>
              <input
                className="input w-full"
                placeholder="Weekly lab meeting"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
              <div>
                <label className="mb-2 block text-sm font-medium text-text-primary">Start</label>
                <input
                  className="input w-full"
                  type="datetime-local"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-text-primary">End</label>
                <input
                  className="input w-full"
                  type="datetime-local"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-text-primary">Location</label>
              <input
                className="input w-full"
                placeholder="Room A / Zoom / Online"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </div>

            <button
              className="rounded-[12px] bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
              disabled={creating}
            >
              {creating ? "Creating..." : "Add event"}
            </button>
          </form>
        </GlassCard>

        <GlassCard className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Upcoming board</p>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">Next 30 days</h2>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-text-muted">Loading upcoming events...</p>
          ) : groupedRows.length === 0 ? (
            <div className="workspace-inset px-4 py-5">
              <p className="text-sm font-medium text-text-primary">No events scheduled.</p>
              <p className="mt-1 text-sm text-text-secondary">
                Add the next meeting or review checkpoint so the team has a visible timeline.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedRows.map((group) => (
                <div key={group.key} className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">{group.label}</p>
                  {group.events.map((row) => (
                    <div key={row.id} className="workspace-row px-4 py-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text-primary">{row.title}</p>
                          <p className="mt-1 text-sm text-text-secondary">{formatRange(row.start_time, row.end_time)}</p>
                          {row.description ? (
                            <p className="mt-2 text-sm text-text-secondary">{row.description}</p>
                          ) : null}
                        </div>
                        <div className="shrink-0">
                          <span className="rounded-[10px] border border-black/10 bg-white px-2.5 py-1 text-xs font-medium text-text-secondary">
                            {row.location?.trim() || "No location"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
