"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/shared/GlassCard";
import { api } from "@/lib/api";
import { useProjectStore } from "@/store/project";

interface Project {
  id: string;
  name: string;
  description?: string | null;
  invite_token: string;
  role: "owner" | "member";
  created_at: string;
  member_count?: number;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ProjectsPage() {
  const router = useRouter();
  const { currentProjectId, setCurrentProject, setProjects } = useProjectStore();
  const [projects, setLocalProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedProjectId, setCopiedProjectId] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const response = await api.get<{ data: Array<Record<string, unknown>> }>("/projects");
      const raw = response.data.data ?? [];
      const list: Project[] = raw.map((project) => ({
        id: project.id as string,
        name: project.name as string,
        description: (project.description as string | null) ?? null,
        invite_token: project.invite_token as string,
        role: ((project.my_role ?? project.role) as "owner" | "member") ?? "member",
        created_at: project.created_at as string,
        member_count: project.member_count as number | undefined,
      }));
      setLocalProjects(list);
      setProjects(list);
    } catch {
      setError("Projects could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [setProjects]);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const copyInviteLink = async (project: Project) => {
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const inviteLink = `${origin}/join/${project.invite_token}`;
      await navigator.clipboard.writeText(inviteLink);
      setCopiedProjectId(project.id);
      window.setTimeout(() => {
        setCopiedProjectId((current) => (current === project.id ? null : current));
      }, 1800);
    } catch {
      setError("Invite link could not be copied.");
    }
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!formName.trim()) return;

    setCreating(true);
    setError(null);
    try {
      await api.post("/projects", {
        name: formName.trim(),
        description: formDesc.trim() || null,
      });
      setFormName("");
      setFormDesc("");
      setShowForm(false);
      await fetchProjects();
    } catch (creationError) {
      const message =
        (creationError as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Project creation failed.";
      setError(message);
    } finally {
      setCreating(false);
    }
  };

  const ownerCount = useMemo(() => projects.filter((project) => project.role === "owner").length, [projects]);
  const memberCountTotal = useMemo(
    () => projects.reduce((sum, project) => sum + (project.member_count ?? 0), 0),
    [projects],
  );

  return (
    <div className="space-y-5">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="bg-white/88 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Projects</p>
            <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-text-primary md:text-[38px]">
              Keep collaboration scoped,
              <br />
              visible, and easy to switch.
            </h1>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-text-secondary">
              Projects define who shares a space, what updates belong together, and which docs should be discoverable by
              that team. Pick one as active when you want the rest of the workspace to follow that context.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <button
                onClick={() => setShowForm((current) => !current)}
                className="rounded-[12px] bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"
              >
                {showForm ? "Close form" : "New project"}
              </button>
              {currentProjectId ? (
                <button
                  onClick={() => setCurrentProject(null)}
                  className="rounded-[12px] border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
                >
                  Clear active project
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-3 lg:grid-cols-1">
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Projects</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{projects.length}</p>
              <p className="mt-1 text-sm text-text-secondary">Total spaces you can currently access.</p>
            </div>
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Owned</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{ownerCount}</p>
              <p className="mt-1 text-sm text-text-secondary">Projects where you can manage members and invites.</p>
            </div>
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Visible members</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{memberCountTotal}</p>
              <p className="mt-1 text-sm text-text-secondary">Sum of current member counts across your projects.</p>
            </div>
          </div>
        </div>
      </GlassCard>

      {error ? (
        <GlassCard>
          <p className="text-sm text-red-500">{error}</p>
        </GlassCard>
      ) : null}

      {showForm ? (
        <GlassCard>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-text-primary">Project name</label>
              <input
                type="text"
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                placeholder="Name the space clearly"
                required
                className="input w-full"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-text-primary">Description</label>
              <textarea
                value={formDesc}
                onChange={(event) => setFormDesc(event.target.value)}
                placeholder="What work belongs in this project?"
                rows={4}
                className="input min-h-[120px] w-full resize-none"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={creating}
                className="rounded-[12px] bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
              >
                {creating ? "Creating..." : "Create project"}
              </button>
            </div>
          </form>
        </GlassCard>
      ) : null}

      {loading ? (
        <GlassCard>
          <p className="text-sm text-text-muted">Loading projects...</p>
        </GlassCard>
      ) : projects.length === 0 ? (
        <GlassCard>
          <p className="text-sm font-medium text-text-primary">No projects yet.</p>
          <p className="mt-1 text-sm text-text-secondary">Create the first project to start inviting collaborators.</p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => {
            const isActive = currentProjectId === project.id;

            return (
              <GlassCard key={project.id} variant="interactive" className="h-full">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 xl:max-w-[680px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => router.push(`/projects/${project.id}`)}
                        className="text-left text-base font-semibold text-text-primary hover:underline"
                      >
                        {project.name}
                      </button>
                      {isActive ? (
                        <span className="rounded-[10px] border border-primary-300/50 bg-primary-500/10 px-2 py-0.5 text-[10px] font-medium text-primary-700">
                          Active
                        </span>
                      ) : null}
                      <span
                        className={`rounded-[10px] px-2 py-0.5 text-[10px] font-medium ${
                          project.role === "owner"
                            ? "border border-amber-300/50 bg-amber-500/10 text-amber-700"
                            : "border border-black/10 bg-white text-text-secondary"
                        }`}
                      >
                        {project.role === "owner" ? "Owner" : "Member"}
                      </span>
                    </div>

                    <p className="mt-3 line-clamp-3 text-sm text-text-secondary">
                      {project.description || "No description yet. Add one so teammates know what belongs here."}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-text-muted">
                      <span className="workspace-inset px-2.5 py-1">Created {formatDate(project.created_at)}</span>
                      <span className="workspace-inset px-2.5 py-1">
                        {project.member_count ?? 0} member{project.member_count === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 xl:w-[280px] xl:justify-end">
                    <button
                      onClick={() => setCurrentProject(isActive ? null : project.id)}
                      className="rounded-[12px] border border-black/10 bg-white px-3.5 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
                    >
                      {isActive ? "Clear active state" : "Set active"}
                    </button>
                    {project.role === "owner" ? (
                      <button
                        onClick={() => void copyInviteLink(project)}
                        className="rounded-[12px] border border-black/10 bg-white px-3.5 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
                      >
                        {copiedProjectId === project.id ? "Invite copied" : "Copy invite"}
                      </button>
                    ) : null}
                    <button
                      onClick={() => router.push(`/projects/${project.id}`)}
                      className="rounded-[12px] bg-primary-500 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-600"
                    >
                      Open project
                    </button>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
