"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { GlassCard } from "@/components/shared/GlassCard";
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

  const fetchProjects = async () => {
    try {
      const res = await api.get<Project[]>("/projects");
      setLocalProjects(res.data);
      setProjects(
        res.data.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          invite_token: p.invite_token,
          role: p.role,
          created_at: p.created_at,
        }))
      );
    } catch {
      setError("Failed to load projects.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchProjects();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
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
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Failed to create project.";
      setError(msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">Projects</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors"
        >
          {showForm ? "Cancel" : "New Project"}
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {showForm && (
        <GlassCard className="mb-6" padding="md">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-primary">
                Project Name
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="My Project"
                required
                className="w-full rounded-lg border border-black/10 bg-white/50 px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-primary">
                Description{" "}
                <span className="text-text-muted font-normal">(optional)</span>
              </label>
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="What is this project about?"
                rows={3}
                className="w-full rounded-lg border border-black/10 bg-white/50 px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create Project"}
            </button>
          </form>
        </GlassCard>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-black/10 border-t-primary-500" />
        </div>
      ) : projects.length === 0 ? (
        <GlassCard className="text-center" padding="lg">
          <p className="text-text-muted">No projects yet. Create one to get started.</p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <GlassCard key={project.id} padding="md" variant="interactive">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => router.push(`/projects/${project.id}`)}
                      className="text-base font-medium text-text-primary hover:underline text-left"
                    >
                      {project.name}
                    </button>
                    {currentProjectId === project.id && (
                      <span className="rounded-full bg-primary-500/15 px-2 py-0.5 text-xs font-medium text-primary-600">
                        Active
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        project.role === "owner"
                          ? "bg-amber-500/15 text-amber-600"
                          : "bg-gray-500/15 text-gray-600"
                      }`}
                    >
                      {project.role}
                    </span>
                  </div>
                  {project.description && (
                    <p className="mt-1 text-sm text-text-secondary line-clamp-2">
                      {project.description}
                    </p>
                  )}
                  {project.member_count !== undefined && (
                    <p className="mt-1 text-xs text-text-muted">
                      {project.member_count} member
                      {project.member_count !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  {currentProjectId !== project.id ? (
                    <button
                      onClick={() => setCurrentProject(project.id)}
                      className="rounded-lg border border-black/10 bg-white/40 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/60 transition-colors"
                    >
                      Switch to
                    </button>
                  ) : (
                    <button
                      onClick={() => setCurrentProject(null)}
                      className="rounded-lg border border-black/10 bg-white/40 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/60 transition-colors"
                    >
                      Deselect
                    </button>
                  )}
                  <button
                    onClick={() => router.push(`/projects/${project.id}`)}
                    className="rounded-lg border border-black/10 bg-white/40 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/60 transition-colors"
                  >
                    Details
                  </button>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
