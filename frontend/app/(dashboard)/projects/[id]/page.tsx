"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { GlassCard } from "@/components/shared/GlassCard";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { api } from "@/lib/api";
import { hexToRgba, resolveMemberColor } from "@/lib/memberColor";
import { useProjectStore } from "@/store/project";

interface Member {
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  member_color?: string | null;
  status_message?: string | null;
  pronouns?: string | null;
  role: "owner" | "member";
  joined_at?: string | null;
}

interface InviteCodeRow {
  id: string;
  code: string;
  status: string;
  usage_count: number;
  usage_limit?: number | null;
  expires_at?: string | null;
  created_at?: string | null;
}

interface ProjectDetail {
  id: string;
  name: string;
  description?: string | null;
  invite_token: string;
  active_invite_code?: InviteCodeRow | null;
  role: "owner" | "member";
  created_at: string;
  members: Member[];
}

function formatDate(value?: string | null): string {
  if (!value) return "Not available";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentProjectId, setCurrentProject } = useProjectStore();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<InviteCodeRow | null>(null);
  const [issuingCode, setIssuingCode] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const fetchProject = useCallback(async () => {
    try {
      const response = await api.get<{ data: Record<string, unknown> }>(`/projects/${id}`);
      const raw = response.data.data;
      const membersList = (raw.members as Array<Record<string, unknown>> | undefined) ?? [];
      const nextProject: ProjectDetail = {
        id: raw.id as string,
        name: raw.name as string,
        description: (raw.description as string | null) ?? null,
        invite_token: raw.invite_token as string,
        active_invite_code: (raw.active_invite_code as InviteCodeRow | null | undefined) ?? null,
        role: ((raw.my_role ?? raw.role) as "owner" | "member") ?? "member",
        created_at: raw.created_at as string,
        members: membersList.map((member) => ({
          user_id: member.user_id as string,
          display_name: (member.display_name as string) ?? "Unknown",
          avatar_url: (member.avatar_url as string | null | undefined) ?? null,
          member_color: (member.member_color as string | null | undefined) ?? null,
          status_message: (member.status_message as string | null | undefined) ?? null,
          pronouns: (member.pronouns as string | null | undefined) ?? null,
          role: (member.role as "owner" | "member") ?? "member",
          joined_at: (member.joined_at as string | null | undefined) ?? null,
        })),
      };

      setProject(nextProject);

      if (nextProject.role === "owner") {
        try {
          const codeResponse = await api.get<{ data?: InviteCodeRow[] }>(`/projects/${id}/invite-codes`, {
            params: { active_only: true, limit: 1 },
          });
          setInviteCode((codeResponse.data?.data ?? [])[0] ?? nextProject.active_invite_code ?? null);
        } catch {
          setInviteCode(nextProject.active_invite_code ?? null);
        }
      } else {
        setInviteCode(nextProject.active_invite_code ?? null);
      }
    } catch {
      setError("Project details could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchProject();
  }, [fetchProject]);

  const inviteLink = project
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/join/${project.invite_token}`
    : "";
  const inviteCodeJoinLink =
    inviteCode && typeof window !== "undefined"
      ? `${window.location.origin}/join/code/${inviteCode.code}`
      : "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Invite link could not be copied.");
    }
  };

  const handleCopyCode = async () => {
    if (!inviteCode?.code) return;
    try {
      await navigator.clipboard.writeText(inviteCode.code);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      setError("Invite code could not be copied.");
    }
  };

  const handleRegenerate = async () => {
    if (!project) return;
    setRegenerating(true);
    try {
      const response = await api.post<{ data?: { invite_token?: string } }>(`/projects/${id}/invite/regenerate`);
      const nextToken = response.data?.data?.invite_token;
      if (!nextToken) throw new Error("Missing invite token");
      setProject((current) => (current ? { ...current, invite_token: nextToken } : current));
    } catch {
      setError("Invite link could not be regenerated.");
    } finally {
      setRegenerating(false);
    }
  };

  const handleIssueInviteCode = async () => {
    setIssuingCode(true);
    try {
      const response = await api.post<{ data?: InviteCodeRow }>(`/projects/${id}/invite-codes`, {
        deactivate_existing: true,
        expires_in_hours: 24 * 14,
        usage_limit: null,
      });
      setInviteCode(response.data?.data ?? null);
    } catch {
      setError("Invite code could not be issued.");
    } finally {
      setIssuingCode(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!window.confirm("Remove this member from the project?")) return;

    setRemovingId(userId);
    try {
      await api.delete(`/projects/${id}/members/${userId}`);
      setProject((current) =>
        current ? { ...current, members: current.members.filter((member) => member.user_id !== userId) } : current,
      );
    } catch {
      setError("Member removal failed.");
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-text-muted">Loading project...</p>;
  }

  if (error || !project) {
    return <p className="text-sm text-red-500">{error ?? "Project not found."}</p>;
  }

  const isOwner = project.role === "owner";
  const isActive = currentProjectId === project.id;

  return (
    <div className="space-y-5">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="bg-white/88 px-6 py-6">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                  project.role === "owner"
                    ? "border border-amber-300/50 bg-amber-500/10 text-amber-700"
                    : "border border-black/10 bg-white text-text-secondary"
                }`}
              >
                {project.role === "owner" ? "Owner" : "Member"}
              </span>
              {isActive ? (
                <span className="rounded-full border border-primary-300/50 bg-primary-500/10 px-2.5 py-0.5 text-[10px] font-medium text-primary-700">
                  Active workspace
                </span>
              ) : null}
            </div>

            <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-text-primary md:text-[38px]">
              {project.name}
            </h1>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-text-secondary">
              {project.description || "No description yet. Add a project summary so collaborators know what belongs here."}
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-xs text-text-muted">
              <span>Created {formatDate(project.created_at)}</span>
              <span>{project.members.length} member{project.members.length === 1 ? "" : "s"}</span>
            </div>

            <div className="mt-6 flex flex-wrap gap-2.5">
              <button
                onClick={() => setCurrentProject(isActive ? null : project.id)}
                className="rounded-full bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"
              >
                {isActive ? "Clear active project" : "Set as active"}
              </button>
            </div>
          </div>

          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-3 lg:grid-cols-1">
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Members</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{project.members.length}</p>
              <p className="mt-1 text-sm text-text-secondary">People who can currently access this space.</p>
            </div>
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Invite link</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">
                {project.invite_token ? "Ready" : "Missing"}
              </p>
              <p className="mt-1 text-sm text-text-secondary">Use when you want a shareable URL instead of a short code.</p>
            </div>
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Invite code</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">
                {inviteCode?.code ? inviteCode.code : "None"}
              </p>
              <p className="mt-1 text-sm text-text-secondary">Short code for fast join flows and onboarding handoff.</p>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <GlassCard className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Members</h2>
            <p className="mt-1 text-sm text-text-secondary">The roster below shows role, join date, and current status line.</p>
          </div>

          <div className="space-y-2">
            {project.members.map((member) => {
              const memberColor = resolveMemberColor(member.user_id, member.member_color);

              return (
                <div
                  key={member.user_id}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-black/[0.06] bg-white/70 px-4 py-3"
                >
                  <div className="min-w-0 flex items-start gap-3">
                    <UserAvatar
                      displayName={member.display_name}
                      avatarUrl={member.avatar_url}
                      userId={member.user_id}
                      memberColor={member.member_color}
                      className="h-10 w-10 shrink-0 text-xs"
                      alt={`${member.display_name} avatar`}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-text-primary">{member.display_name}</p>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            backgroundColor: hexToRgba(memberColor, 0.15),
                            color: memberColor,
                          }}
                        >
                          Color
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            member.role === "owner"
                              ? "border border-amber-300/50 bg-amber-500/10 text-amber-700"
                              : "border border-black/10 bg-white text-text-secondary"
                          }`}
                        >
                          {member.role === "owner" ? "Owner" : "Member"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-text-muted">Joined {formatDate(member.joined_at)}</p>
                      {member.status_message || member.pronouns ? (
                        <p className="mt-1 truncate text-xs text-text-muted">
                          {member.status_message || "No status set"}
                          {member.pronouns ? ` | ${member.pronouns}` : ""}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {isOwner && member.role !== "owner" ? (
                    <button
                      onClick={() => void handleRemoveMember(member.user_id)}
                      disabled={removingId === member.user_id}
                      className="rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60"
                    >
                      {removingId === member.user_id ? "Removing..." : "Remove"}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </GlassCard>

        <div className="space-y-4">
          <GlassCard className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Invite tools</p>
              <p className="mt-2 text-sm text-text-secondary">
                Share this space with a full link or a short code. Regeneration is owner-only because it rotates access.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-text-muted">Invite link</label>
              <div className="flex gap-2">
                <input readOnly value={inviteLink} className="input min-w-0 flex-1 text-sm" />
                <button
                  onClick={handleCopy}
                  className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-black/[0.06] bg-black/[0.03] p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-text-primary">Invite code</p>
                  <p className="mt-1 text-xs text-text-muted">Useful when someone is already on the login screen.</p>
                </div>
                {isOwner ? (
                  <button
                    onClick={handleIssueInviteCode}
                    disabled={issuingCode}
                    className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-black/[0.03] disabled:opacity-60"
                  >
                    {issuingCode ? "Issuing..." : inviteCode ? "Refresh code" : "Issue code"}
                  </button>
                ) : null}
              </div>

              {inviteCode ? (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={inviteCode.code}
                      className="input w-full font-mono tracking-[0.22em]"
                    />
                    <button
                      onClick={handleCopyCode}
                      className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
                    >
                      {codeCopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs text-text-muted">
                    {inviteCode.expires_at
                      ? `Expires ${formatDate(inviteCode.expires_at)}`
                      : "No expiry set"}
                    {typeof inviteCode.usage_limit === "number"
                      ? ` | Used ${inviteCode.usage_count}/${inviteCode.usage_limit}`
                      : ` | Used ${inviteCode.usage_count}`}
                  </p>
                  <input readOnly value={inviteCodeJoinLink} className="input w-full text-xs" />
                </div>
              ) : (
                <p className="mt-4 text-xs text-text-muted">
                  {isOwner ? "No active invite code yet." : "The owner has not issued an invite code yet."}
                </p>
              )}
            </div>

            {isOwner ? (
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="rounded-full border border-black/10 bg-white px-3.5 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-black/[0.03] disabled:opacity-60"
              >
                {regenerating ? "Regenerating link..." : "Regenerate invite link"}
              </button>
            ) : null}

            {error ? <p className="text-sm text-red-500">{error}</p> : null}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
