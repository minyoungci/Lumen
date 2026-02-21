"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { GlassCard } from "@/components/shared/GlassCard";
import { useProjectStore } from "@/store/project";

interface Member {
  user_id: string;
  email: string;
  role: "owner" | "member";
  joined_at: string;
}

interface ProjectDetail {
  id: string;
  name: string;
  description?: string | null;
  invite_token: string;
  role: "owner" | "member";
  created_at: string;
  members: Member[];
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

  const fetchProject = async () => {
    try {
      const res = await api.get<ProjectDetail>(`/projects/${id}`);
      setProject(res.data);
    } catch {
      setError("Failed to load project.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchProject();
  }, [id]);

  const inviteLink = project
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/join/${project.invite_token}`
    : "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleRegenerate = async () => {
    if (!project) return;
    setRegenerating(true);
    try {
      const res = await api.post<{ invite_token: string }>(
        `/projects/${id}/invite/regenerate`
      );
      setProject((prev) =>
        prev ? { ...prev, invite_token: res.data.invite_token } : prev
      );
    } catch {
      setError("Failed to regenerate invite link.");
    } finally {
      setRegenerating(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    setRemovingId(userId);
    try {
      await api.delete(`/projects/${id}/members/${userId}`);
      setProject((prev) =>
        prev
          ? { ...prev, members: prev.members.filter((m) => m.user_id !== userId) }
          : prev
      );
    } catch {
      setError("Failed to remove member.");
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-black/10 border-t-primary-500" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-red-400">{error ?? "Project not found."}</p>
      </div>
    );
  }

  const isOwner = project.role === "owner";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">{project.name}</h1>
          {project.description && (
            <p className="mt-1 text-sm text-text-secondary">{project.description}</p>
          )}
          <span
            className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
              project.role === "owner"
                ? "bg-amber-500/15 text-amber-600"
                : "bg-gray-500/15 text-gray-600"
            }`}
          >
            {project.role}
          </span>
        </div>
        {currentProjectId !== project.id ? (
          <button
            onClick={() => setCurrentProject(project.id)}
            className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors flex-shrink-0"
          >
            Set as Current
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="rounded-full bg-primary-500/15 px-3 py-1 text-xs font-medium text-primary-600">
              Active Project
            </span>
            <button
              onClick={() => setCurrentProject(null)}
              className="rounded-lg border border-black/10 bg-white/40 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/60 transition-colors"
            >
              Deselect
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
      )}

      {/* Invite Link */}
      <GlassCard padding="md">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Invite Link</h2>
        <div className="flex gap-2">
          <input
            readOnly
            value={inviteLink}
            className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white/50 px-3 py-2 text-sm text-text-secondary outline-none"
          />
          <button
            onClick={handleCopy}
            className="rounded-lg border border-black/10 bg-white/40 px-3 py-2 text-sm font-medium text-text-secondary hover:bg-white/60 transition-colors flex-shrink-0"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        {isOwner && (
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="mt-2 text-xs text-text-muted hover:text-text-secondary transition-colors disabled:opacity-50"
          >
            {regenerating ? "Regenerating…" : "Regenerate invite link"}
          </button>
        )}
      </GlassCard>

      {/* Members */}
      <GlassCard padding="md">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">
          Members ({project.members.length})
        </h2>
        <div className="space-y-2">
          {project.members.map((member) => (
            <div
              key={member.user_id}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-black/5 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">
                  {member.email}
                </p>
                <p className="text-xs text-text-muted">
                  Joined{" "}
                  {new Date(member.joined_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    member.role === "owner"
                      ? "bg-amber-500/15 text-amber-600"
                      : "bg-gray-500/15 text-gray-600"
                  }`}
                >
                  {member.role}
                </span>
                {isOwner && member.role !== "owner" && (
                  <button
                    onClick={() => handleRemoveMember(member.user_id)}
                    disabled={removingId === member.user_id}
                    className="rounded-lg px-2 py-1 text-xs text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    {removingId === member.user_id ? "Removing…" : "Remove"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
