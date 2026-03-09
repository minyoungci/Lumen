"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { api } from "@/lib/api";
import { hexToRgba, resolveMemberColor } from "@/lib/memberColor";

interface ProjectMembership {
  project_id: string;
  project_name: string;
  role: "owner" | "member";
  joined_at?: string;
}

interface ActivityBucket {
  total: number;
  research_notes: number;
  shared_posts: number;
  comments: number;
  daily_logs: number;
}

interface UserActivity extends ActivityBucket {
  window_days: number;
  last_active_at?: string | null;
  recent: ActivityBucket;
}

interface UserRow {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  member_color?: string | null;
  role: "admin" | "member";
  is_active: boolean;
  projects: ProjectMembership[];
  activity?: UserActivity;
}

function formatLastActive(value?: string | null): string {
  if (!value) return "No recent activity";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No recent activity";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState<7 | 30>(7);
  const [sortBy, setSortBy] = useState<"recent" | "total" | "last_active" | "name">("recent");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/admin/users", { params: { window_days: windowDays } });
      setRows(response.data?.data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    const toMs = (value?: string | null) => (value ? Date.parse(value) : 0);
    const activityTotal = (row: UserRow) => row.activity?.total ?? 0;
    const activityRecent = (row: UserRow) => row.activity?.recent?.total ?? 0;

    copy.sort((a, b) => {
      if (sortBy === "name") {
        return a.display_name.localeCompare(b.display_name, "en");
      }
      if (sortBy === "total") {
        const diff = activityTotal(b) - activityTotal(a);
        if (diff !== 0) return diff;
        return activityRecent(b) - activityRecent(a);
      }
      if (sortBy === "last_active") {
        const diff = toMs(b.activity?.last_active_at) - toMs(a.activity?.last_active_at);
        if (diff !== 0) return diff;
        return activityRecent(b) - activityRecent(a);
      }
      const diff = activityRecent(b) - activityRecent(a);
      if (diff !== 0) return diff;
      return activityTotal(b) - activityTotal(a);
    });

    return copy;
  }, [rows, sortBy]);

  const summary = useMemo(() => {
    const totalRecent = rows.reduce((sum, row) => sum + (row.activity?.recent?.total ?? 0), 0);
    const activeInWindow = rows.filter((row) => (row.activity?.recent?.total ?? 0) > 0).length;
    const activeAccounts = rows.filter((row) => row.is_active).length;
    return { totalRecent, activeInWindow, activeAccounts };
  }, [rows]);

  const toggleExpand = (userId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleRoleChange = async (projectId: string, userId: string, newRole: "owner" | "member") => {
    const key = `role-${projectId}-${userId}`;
    setActionLoading(key);
    try {
      await api.patch(`/admin/projects/${projectId}/members/${userId}`, { role: newRole });
      await load();
    } catch {
      window.alert("Role change failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    const action = isActive ? "deactivate" : "activate";
    if (!window.confirm(`Do you want to ${action} this user?`)) return;

    const key = `active-${userId}`;
    setActionLoading(key);
    try {
      if (isActive) {
        await api.delete(`/admin/users/${userId}`);
      } else {
        await api.patch(`/admin/users/${userId}/activate`);
      }
      await load();
    } catch {
      window.alert(`${action} failed.`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleHardDelete = async (userId: string, displayName: string) => {
    const ok = window.confirm(`Permanently delete "${displayName}"? This cannot be undone.`);
    if (!ok) return;

    const finalCheck = window.prompt('Type DELETE to confirm permanent removal.');
    if (finalCheck !== "DELETE") return;

    const key = `hard-${userId}`;
    setActionLoading(key);
    try {
      await api.delete(`/admin/users/${userId}/hard`);
      await load();
    } catch {
      window.alert("Permanent delete failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveMember = async (projectId: string, userId: string, projectName: string) => {
    if (!window.confirm(`Remove this user from "${projectName}"?`)) return;

    const key = `del-${projectId}-${userId}`;
    setActionLoading(key);
    try {
      await api.delete(`/admin/projects/${projectId}/members/${userId}`);
      await load();
    } catch {
      window.alert("Member removal failed.");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-5">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="bg-white/88 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Admin users</p>
            <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-text-primary md:text-[38px]">
              Inspect user health,
              <br />
              then act from the same surface.
            </h1>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-text-secondary">
              Sort by recent activity, total activity, last seen time, or name. Expand a user only when you need project
              membership changes or account-level action.
            </p>
          </div>

          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-3 lg:grid-cols-1">
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Accounts</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{rows.length}</p>
              <p className="mt-1 text-sm text-text-secondary">{summary.activeAccounts} currently active.</p>
            </div>
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Active in window</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{summary.activeInWindow}</p>
              <p className="mt-1 text-sm text-text-secondary">Users with activity in the selected period.</p>
            </div>
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Recent activity</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{summary.totalRecent}</p>
              <p className="mt-1 text-sm text-text-secondary">Total actions in the selected period.</p>
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {[7, 30].map((days) => (
              <button
                key={days}
                onClick={() => setWindowDays(days as 7 | 30)}
                className={`rounded-[12px] border px-3.5 py-2 text-sm font-medium transition-colors ${
                  windowDays === days
                    ? "border-primary-500/40 bg-primary-500/10 text-primary-700"
                    : "border-black/10 bg-white text-text-secondary hover:bg-black/[0.03] hover:text-text-primary"
                }`}
              >
                Last {days} days
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm text-text-secondary">
            Sort
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as "recent" | "total" | "last_active" | "name")}
              className="input w-[180px]"
            >
              <option value="recent">Recent activity</option>
              <option value="total">Total activity</option>
              <option value="last_active">Last active time</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>
      </GlassCard>

      {loading ? (
        <GlassCard>
          <p className="text-sm text-text-muted">Loading users...</p>
        </GlassCard>
      ) : sortedRows.length === 0 ? (
        <GlassCard>
          <p className="text-sm text-text-muted">No users found.</p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {sortedRows.map((row) => {
            const memberColor = resolveMemberColor(row.id, row.member_color);
            const actionKey = `active-${row.id}`;
            const hardKey = `hard-${row.id}`;
            const activity = row.activity;
            const recent = activity?.recent;

            return (
              <GlassCard key={row.id}>
                <div className="workspace-row px-4 py-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <UserAvatar
                      displayName={row.display_name}
                      avatarUrl={row.avatar_url}
                      userId={row.id}
                      memberColor={row.member_color}
                      className="h-10 w-10 shrink-0 text-sm"
                      alt={`${row.display_name} avatar`}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-text-primary">{row.display_name}</p>
                        <span
                          className={`rounded-[10px] px-2 py-0.5 text-[10px] font-medium ${
                            row.role === "admin"
                              ? "border border-primary-300/50 bg-primary-500/10 text-primary-700"
                              : "border border-black/10 bg-white text-text-secondary"
                          }`}
                        >
                          {row.role}
                        </span>
                        <span
                          className="rounded-[10px] px-2 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: hexToRgba(memberColor, 0.15), color: memberColor }}
                        >
                          Color
                        </span>
                        <span
                          className={`rounded-[10px] px-2 py-0.5 text-[10px] font-medium ${
                            row.is_active
                              ? "border border-emerald-300/50 bg-emerald-500/10 text-emerald-700"
                              : "border border-black/10 bg-white text-text-secondary"
                          }`}
                        >
                          {row.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-text-muted">{row.id}</p>
                      <p className="mt-1 text-xs text-text-muted">Last active {formatLastActive(activity?.last_active_at)}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => void handleToggleActive(row.id, row.is_active)}
                        disabled={actionLoading === actionKey || row.role === "admin"}
                        className={`rounded-[10px] px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60 ${
                          row.is_active
                            ? "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                            : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                      >
                        {actionLoading === actionKey ? "Working..." : row.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => void handleHardDelete(row.id, row.display_name)}
                        disabled={actionLoading === hardKey || row.role === "admin"}
                        className="rounded-[10px] border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
                      >
                        {actionLoading === hardKey ? "Working..." : "Permanent delete"}
                      </button>
                      <button
                        onClick={() => toggleExpand(row.id)}
                        className="rounded-[10px] border border-black/10 bg-white px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
                      >
                        {expanded.has(row.id) ? "Hide memberships" : `Memberships (${row.projects.length})`}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                    {[
                      { label: `Recent ${windowDays}d`, value: recent?.total ?? 0 },
                      { label: "Total", value: activity?.total ?? 0 },
                      { label: "Notes", value: activity?.research_notes ?? 0 },
                      { label: "Shared", value: activity?.shared_posts ?? 0 },
                      { label: "Comments + logs", value: (activity?.comments ?? 0) + (activity?.daily_logs ?? 0) },
                    ].map((item) => (
                      <div key={item.label} className="workspace-stat px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">{item.label}</p>
                        <p className="mt-2 text-lg font-semibold text-text-primary">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  {expanded.has(row.id) ? (
                    <div className="mt-4 space-y-4 border-t border-black/[0.06] pt-4">
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        {[
                          { label: "Recent notes", value: recent?.research_notes ?? 0 },
                          { label: "Recent shared", value: recent?.shared_posts ?? 0 },
                          { label: "Recent comments", value: recent?.comments ?? 0 },
                          { label: "Recent journal", value: recent?.daily_logs ?? 0 },
                        ].map((item) => (
                          <div key={item.label} className="workspace-stat px-3 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">{item.label}</p>
                            <p className="mt-2 text-lg font-semibold text-text-primary">{item.value}</p>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-2">
                        {row.projects.length === 0 ? (
                          <p className="text-sm text-text-muted">This user is not in any projects.</p>
                        ) : (
                          row.projects.map((project) => {
                            const roleKey = `role-${project.project_id}-${row.id}`;
                            const removeKey = `del-${project.project_id}-${row.id}`;

                            return (
                              <div
                                key={project.project_id}
                                className="workspace-row flex flex-wrap items-center gap-2 px-4 py-3"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-text-primary">{project.project_name}</p>
                                  <p className="mt-1 text-xs text-text-muted">
                                    Joined {project.joined_at ? formatLastActive(project.joined_at) : "Not available"}
                                  </p>
                                </div>
                                <select
                                  value={project.role}
                                  disabled={actionLoading === roleKey}
                                  onChange={(event) =>
                                    void handleRoleChange(
                                      project.project_id,
                                      row.id,
                                      event.target.value as "owner" | "member",
                                    )
                                  }
                                  className="input w-[120px]"
                                >
                                  <option value="owner">owner</option>
                                  <option value="member">member</option>
                                </select>
                                <button
                                  onClick={() => void handleRemoveMember(project.project_id, row.id, project.project_name)}
                                  disabled={actionLoading === removeKey}
                                  className="rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60"
                                >
                                  {actionLoading === removeKey ? "Removing..." : "Remove"}
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
