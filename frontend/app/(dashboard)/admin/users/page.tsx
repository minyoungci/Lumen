"use client";

import { useCallback, useEffect, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { api } from "@/lib/api";

interface ProjectMembership {
  project_id: string;
  project_name: string;
  role: "owner" | "member";
  joined_at?: string;
}

interface UserRow {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  role: "admin" | "member";
  is_active: boolean;
  projects: ProjectMembership[];
}

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/admin/users");
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleExpand = (userId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
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
      alert("역할 변경에 실패했습니다.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    const action = isActive ? "비활성화" : "활성화";
    if (!confirm(`이 유저를 ${action}하시겠습니까?`)) return;
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
      alert(`${action} 처리에 실패했습니다.`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveMember = async (projectId: string, userId: string, projectName: string) => {
    if (!confirm(`"${projectName}" 프로젝트에서 이 멤버를 삭제하시겠습니까?`)) return;
    const key = `del-${projectId}-${userId}`;
    setActionLoading(key);
    try {
      await api.delete(`/admin/projects/${projectId}/members/${userId}`);
      await load();
    } catch {
      alert("멤버 삭제에 실패했습니다.");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Users</h1>
          <p className="text-sm text-text-muted">멤버 관리 및 프로젝트 소속 확인</p>
        </div>
        {!loading && <span className="text-sm text-text-muted">{rows.length}명</span>}
      </div>

      {loading ? (
        <p className="text-sm text-text-muted">불러오는 중...</p>
      ) : rows.length === 0 ? (
        <GlassCard><p className="text-sm text-text-muted">유저가 없습니다.</p></GlassCard>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <GlassCard key={row.id} className="space-y-0">
              {/* User header */}
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-500/15 text-sm font-semibold text-primary-600">
                  {row.display_name[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-text-primary">{row.display_name}</p>
                  <p className="text-[11px] text-text-muted font-mono">{row.id.slice(0, 18)}…</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    row.role === "admin"
                      ? "bg-primary-500/15 text-primary-600"
                      : "bg-black/[0.06] text-text-secondary"
                  }`}>
                    {row.role}
                  </span>
                  <span
                    className={`h-2 w-2 rounded-full flex-shrink-0 ${row.is_active ? "bg-green-400" : "bg-gray-300"}`}
                    title={row.is_active ? "활성" : "비활성"}
                  />
                  <button
                    onClick={() => void handleToggleActive(row.id, row.is_active)}
                    disabled={actionLoading === `active-${row.id}`}
                    className={`rounded px-2 py-0.5 text-xs disabled:opacity-50 transition-colors ${
                      row.is_active
                        ? "text-red-500 hover:bg-red-50"
                        : "text-green-600 hover:bg-green-50"
                    }`}
                  >
                    {actionLoading === `active-${row.id}` ? "..." : row.is_active ? "비활성화" : "활성화"}
                  </button>
                  <button
                    onClick={() => toggleExpand(row.id)}
                    className="rounded-lg border border-black/10 bg-white/60 px-2.5 py-1 text-xs text-text-secondary hover:bg-white transition-colors"
                  >
                    프로젝트 {row.projects.length}개 {expanded.has(row.id) ? "▲" : "▼"}
                  </button>
                </div>
              </div>

              {/* Project memberships */}
              {expanded.has(row.id) && (
                <div className="mt-3 border-t border-black/[0.06] pt-3 space-y-1">
                  {row.projects.length === 0 ? (
                    <p className="text-xs text-text-muted px-1">소속 프로젝트 없음</p>
                  ) : (
                    row.projects.map((proj) => {
                      const roleKey = `role-${proj.project_id}-${row.id}`;
                      const delKey = `del-${proj.project_id}-${row.id}`;
                      return (
                        <div
                          key={proj.project_id}
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-black/[0.03]"
                        >
                          <span className="flex-1 text-sm text-text-primary truncate">{proj.project_name}</span>
                          <select
                            value={proj.role}
                            disabled={actionLoading === roleKey}
                            onChange={(e) =>
                              void handleRoleChange(proj.project_id, row.id, e.target.value as "owner" | "member")
                            }
                            className="rounded border border-black/10 bg-white/80 px-1.5 py-0.5 text-xs text-text-secondary focus:outline-none disabled:opacity-50"
                          >
                            <option value="owner">owner</option>
                            <option value="member">member</option>
                          </select>
                          <button
                            onClick={() => void handleRemoveMember(proj.project_id, row.id, proj.project_name)}
                            disabled={actionLoading === delKey}
                            className="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
                          >
                            {actionLoading === delKey ? "..." : "삭제"}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
