"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { api } from "@/lib/api";

interface Stats {
  users: { total: number; active: number };
  content: {
    research_notes: number;
    shared_posts: number;
    kanban_cards: number;
    articles: number;
    comments: number;
    tags: number;
  };
  storage: { total_used_bytes: number; total_files: number };
  activity: { posts_this_week: number; comments_this_week: number; active_users_today: number };
}

interface StorageIntegrityReport {
  uploads: {
    scanned: number;
    resolved_paths: number;
    unresolved_paths: number;
    present_in_supabase: number;
    present_in_local_backup: number;
    present_in_both: number;
    missing_in_supabase: number;
    missing_in_local_backup: number;
    missing_in_both: number;
  };
  shared_media: {
    scanned_posts: number;
    unique_paths: number;
    missing_paths: number;
    missing_samples: Array<{ post_id: string; post_title: string; object_path: string }>;
  };
}

interface MissingUploadRow {
  upload_id: string;
  user_id: string;
  original_name: string;
  mime_type: string;
  file_type: string;
  size_bytes: number;
  object_path: string;
  missing_supabase: boolean;
  missing_local_backup: boolean;
  created_at?: string | null;
}

interface KnowledgeHealth {
  documents_total: number;
  documents_active: number;
  chunks_total: number;
  links_total: number;
  jobs_queued_or_running: number;
  jobs_failed_24h: number;
  last_indexed_at?: string | null;
  embedding_provider?: string;
  embedding_model?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [integrity, setIntegrity] = useState<StorageIntegrityReport | null>(null);
  const [integrityLoading, setIntegrityLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);
  const [missingUploads, setMissingUploads] = useState<MissingUploadRow[]>([]);
  const [missingLoading, setMissingLoading] = useState(true);
  const [missingMessage, setMissingMessage] = useState<string | null>(null);
  const [reuploadingId, setReuploadingId] = useState<string | null>(null);
  const [knowledgeHealth, setKnowledgeHealth] = useState<KnowledgeHealth | null>(null);

  const loadIntegrity = async () => {
    setIntegrityLoading(true);
    try {
      const response = await api.get("/admin/storage/integrity", {
        params: { upload_limit: 1000, shared_post_limit: 1000 },
      });
      setIntegrity(response.data?.data ?? null);
    } catch {
      setIntegrity(null);
    } finally {
      setIntegrityLoading(false);
    }
  };

  const loadMissingUploads = async () => {
    setMissingLoading(true);
    try {
      const response = await api.get("/admin/storage/missing-uploads", {
        params: { mode: "both", limit: 500 },
      });
      setMissingUploads(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch {
      setMissingUploads([]);
    } finally {
      setMissingLoading(false);
    }
  };

  const runStorageRepair = async () => {
    setRepairing(true);
    setRepairMessage(null);
    try {
      const response = await api.post("/admin/storage/integrity/repair", {
        upload_limit: 1000,
        shared_post_limit: 1000,
      });
      const data = response.data?.data;
      const repairedSupabase = Number(data?.repaired_supabase_objects ?? 0);
      const repairedLocal = Number(data?.repaired_local_backups ?? 0);
      const failed = Array.isArray(data?.failed_repairs) ? data.failed_repairs.length : 0;
      setRepairMessage(
        `Repair completed. Supabase ${repairedSupabase}, local backup ${repairedLocal}, failed ${failed}.`,
      );
      if (data?.integrity_after) {
        setIntegrity(data.integrity_after);
      } else {
        await loadIntegrity();
      }
      await loadMissingUploads();
    } catch {
      setRepairMessage("Automatic repair failed.");
    } finally {
      setRepairing(false);
    }
  };

  const reuploadMissing = async (uploadId: string, file: File) => {
    setReuploadingId(uploadId);
    setMissingMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post(`/admin/storage/missing-uploads/${uploadId}/reupload`, form);
      setMissingMessage("Missing upload restored.");
      await Promise.all([loadMissingUploads(), loadIntegrity()]);
    } catch (error) {
      const detail =
        (error as { response?: { data?: { detail?: string; message?: string } } })?.response?.data?.detail ??
        (error as { response?: { data?: { detail?: string; message?: string } } })?.response?.data?.message ??
        "Reupload failed.";
      setMissingMessage(detail);
    } finally {
      setReuploadingId(null);
    }
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [statsResponse, integrityResponse, missingResponse, knowledgeResponse] = await Promise.all([
          api.get("/admin/stats"),
          api.get("/admin/storage/integrity", {
            params: { upload_limit: 1000, shared_post_limit: 1000 },
          }),
          api.get("/admin/storage/missing-uploads", {
            params: { mode: "both", limit: 500 },
          }),
          api.get("/admin/knowledge/health"),
        ]);

        if (!mounted) return;

        setStats(statsResponse.data?.data ?? null);
        setIntegrity(integrityResponse.data?.data ?? null);
        setMissingUploads(Array.isArray(missingResponse.data?.data) ? missingResponse.data.data : []);
        setKnowledgeHealth((knowledgeResponse as { data?: { data?: KnowledgeHealth } }).data?.data ?? null);
      } catch {
        if (!mounted) return;
        setStats(null);
        setIntegrity(null);
        setMissingUploads([]);
        setKnowledgeHealth(null);
      } finally {
        if (mounted) {
          setLoading(false);
          setIntegrityLoading(false);
          setMissingLoading(false);
        }
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-text-muted">Loading admin workspace...</p>;
  }

  if (!stats) {
    return <p className="text-sm text-text-muted">Admin data could not be loaded.</p>;
  }

  return (
    <div className="space-y-5">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="bg-white/88 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Admin</p>
            <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-text-primary md:text-[38px]">
              Operate the workspace,
              <br />
              not just inspect it.
            </h1>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-text-secondary">
              This surface is for platform health, user oversight, content volume, and recovery actions. The goal is
              fast signal first, deep recovery second.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link
                href="/admin/users"
                className="rounded-full bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"
              >
                Open users
              </Link>
              <Link
                href="/admin/site-config"
                className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
              >
                Edit site config
              </Link>
              <Link
                href="/admin/ai-summary"
                className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
              >
                Review AI summaries
              </Link>
            </div>
          </div>

          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-3 lg:grid-cols-1">
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Users</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{stats.users.total}</p>
              <p className="mt-1 text-sm text-text-secondary">{stats.users.active} currently active.</p>
            </div>
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Content</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{stats.content.shared_posts}</p>
              <p className="mt-1 text-sm text-text-secondary">Shared docs and updates currently published.</p>
            </div>
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Storage</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">
                {formatBytes(stats.storage.total_used_bytes)}
              </p>
              <p className="mt-1 text-sm text-text-secondary">{stats.storage.total_files} files tracked.</p>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GlassCard>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Research notes</p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{stats.content.research_notes}</p>
          <p className="mt-1 text-sm text-text-secondary">Draft and shared notes across all users.</p>
        </GlassCard>
        <GlassCard>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Articles</p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{stats.content.articles}</p>
          <p className="mt-1 text-sm text-text-secondary">Long-form team documents.</p>
        </GlassCard>
        <GlassCard>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Updates</p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{stats.content.kanban_cards}</p>
          <p className="mt-1 text-sm text-text-secondary">Short project signals and feed items.</p>
        </GlassCard>
        <GlassCard>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Comments</p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{stats.content.comments}</p>
          <p className="mt-1 text-sm text-text-secondary">{stats.content.tags} tags currently in the graph.</p>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GlassCard>
          <h2 className="text-sm font-semibold text-text-primary">Recent activity</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-black/[0.06] bg-white/60 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Posts this week</p>
              <p className="mt-2 text-xl font-semibold text-text-primary">{stats.activity.posts_this_week}</p>
            </div>
            <div className="rounded-2xl border border-black/[0.06] bg-white/60 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Comments this week</p>
              <p className="mt-2 text-xl font-semibold text-text-primary">{stats.activity.comments_this_week}</p>
            </div>
            <div className="rounded-2xl border border-black/[0.06] bg-white/60 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Active today</p>
              <p className="mt-2 text-xl font-semibold text-text-primary">{stats.activity.active_users_today}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-text-primary">Knowledge index</h2>
            {knowledgeHealth?.last_indexed_at ? (
              <span className="text-xs text-text-muted">Last indexed {formatDate(knowledgeHealth.last_indexed_at)}</span>
            ) : null}
          </div>

          {knowledgeHealth ? (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-black/[0.06] bg-white/60 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Documents</p>
                <p className="mt-2 text-xl font-semibold text-text-primary">
                  {knowledgeHealth.documents_active}/{knowledgeHealth.documents_total}
                </p>
              </div>
              <div className="rounded-2xl border border-black/[0.06] bg-white/60 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Chunks</p>
                <p className="mt-2 text-xl font-semibold text-text-primary">{knowledgeHealth.chunks_total}</p>
              </div>
              <div className="rounded-2xl border border-black/[0.06] bg-white/60 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Links</p>
                <p className="mt-2 text-xl font-semibold text-text-primary">{knowledgeHealth.links_total}</p>
              </div>
              <div className="rounded-2xl border border-black/[0.06] bg-white/60 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Jobs</p>
                <p className="mt-2 text-xl font-semibold text-text-primary">{knowledgeHealth.jobs_queued_or_running}</p>
                <p className="mt-1 text-xs text-text-muted">Failed in 24h: {knowledgeHealth.jobs_failed_24h}</p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-text-muted">Knowledge health metrics are unavailable.</p>
          )}
        </GlassCard>
      </div>

      <GlassCard className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Storage integrity</h2>
            <p className="mt-1 text-sm text-text-secondary">Check missing objects, verify backups, and run repair when needed.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void loadIntegrity()}
              disabled={integrityLoading || repairing}
              className="rounded-full border border-black/10 bg-white px-3.5 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-black/[0.03] disabled:opacity-60"
            >
              {integrityLoading ? "Refreshing..." : "Refresh checks"}
            </button>
            <button
              onClick={() => void runStorageRepair()}
              disabled={repairing}
              className="rounded-full bg-primary-500 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
            >
              {repairing ? "Running repair..." : "Run repair"}
            </button>
          </div>
        </div>

        {integrity ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Uploads scanned", value: integrity.uploads.scanned },
              { label: "Missing in Supabase", value: integrity.uploads.missing_in_supabase },
              { label: "Missing in backup", value: integrity.uploads.missing_in_local_backup },
              { label: "Missing in both", value: integrity.uploads.missing_in_both },
              { label: "Missing media refs", value: integrity.shared_media.missing_paths },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-black/[0.06] bg-white/60 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">{item.label}</p>
                <p className="mt-2 text-xl font-semibold text-text-primary">{item.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">Integrity metrics are unavailable.</p>
        )}

        {repairMessage ? <p className="text-sm text-text-secondary">{repairMessage}</p> : null}
      </GlassCard>

      <GlassCard className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Missing uploads</h2>
            <p className="mt-1 text-sm text-text-secondary">These files are missing in both storage locations and need manual reupload.</p>
          </div>
          <button
            onClick={() => void loadMissingUploads()}
            disabled={missingLoading || reuploadingId !== null}
            className="rounded-full border border-black/10 bg-white px-3.5 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-black/[0.03] disabled:opacity-60"
          >
            {missingLoading ? "Refreshing..." : "Refresh list"}
          </button>
        </div>

        {missingUploads.length === 0 ? (
          <p className="text-sm text-text-muted">No uploads are missing in both storage layers.</p>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full divide-y divide-black/10 text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                  <th className="px-2 py-2">File</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Size</th>
                  <th className="px-2 py-2">Object path</th>
                  <th className="px-2 py-2">Restore</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {missingUploads.map((row) => (
                  <tr key={row.upload_id}>
                    <td className="px-2 py-3 text-text-primary">{row.original_name}</td>
                    <td className="px-2 py-3 text-text-muted">{row.mime_type}</td>
                    <td className="px-2 py-3 text-text-muted">{formatBytes(row.size_bytes)}</td>
                    <td className="px-2 py-3 font-mono text-[11px] text-text-muted">{row.object_path}</td>
                    <td className="px-2 py-3">
                      <label
                        htmlFor={`reupload-${row.upload_id}`}
                        className={`inline-flex cursor-pointer rounded-full px-3 py-2 text-xs font-medium text-white ${
                          reuploadingId === row.upload_id ? "bg-gray-400" : "bg-primary-500 hover:bg-primary-600"
                        }`}
                      >
                        {reuploadingId === row.upload_id ? "Uploading..." : "Reupload"}
                      </label>
                      <input
                        id={`reupload-${row.upload_id}`}
                        type="file"
                        className="hidden"
                        disabled={reuploadingId !== null}
                        onChange={(event) => {
                          const selected = event.target.files?.[0];
                          event.currentTarget.value = "";
                          if (!selected) return;
                          void reuploadMissing(row.upload_id, selected);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {missingMessage ? <p className="text-sm text-text-secondary">{missingMessage}</p> : null}
      </GlassCard>
    </div>
  );
}
