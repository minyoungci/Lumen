"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { api } from "@/lib/api";
import { contentTone } from "@/lib/contentColor";
import { hexToRgba, resolveMemberColor } from "@/lib/memberColor";
import { useProjectStore } from "@/store/project";

interface SharedArticle {
  id: string;
  user_id: string;
  title: string;
  preview: string;
  cover_image_url?: string | null;
  author_name?: string | null;
  author_avatar_url?: string | null;
  author_member_color?: string | null;
  author_status_message?: string | null;
  author_pronouns?: string | null;
  updated_at?: string | null;
  view_count: number;
}

interface CurrentUser {
  id?: string;
  role?: "admin" | "member";
}

function formatWhen(value?: string | null): string {
  if (!value) return "Recently";
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SharedArticlesPage() {
  const { currentProjectId, projects } = useProjectStore();
  const [rows, setRows] = useState<SharedArticle[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const articleTone = contentTone("article");

  const projectName = useMemo(
    () => projects.find((project) => project.id === currentProjectId)?.name ?? null,
    [currentProjectId, projects]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [postsRes, meRes] = await Promise.allSettled([
        api.get("/shared-posts", {
          params: {
            type: "article",
            limit: 100,
            project_id: currentProjectId ?? undefined,
          },
        }),
        api.get("/users/me"),
      ]);

      setRows(postsRes.status === "fulfilled" ? ((postsRes.value.data?.data ?? []) as SharedArticle[]) : []);

      if (meRes.status === "fulfilled") {
        const me = meRes.value.data?.data ?? meRes.value.data ?? {};
        setCurrentUser({
          id: typeof me?.id === "string" ? me.id : undefined,
          role: me?.role === "admin" ? "admin" : "member",
        });
      } else {
        setCurrentUser(null);
      }
    } catch {
      setRows([]);
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  }, [currentProjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (event: React.MouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();

    if (!window.confirm("Delete this doc? This cannot be undone.")) return;

    setDeletingId(id);
    try {
      await api.delete(`/shared-posts/${id}`);
      setRows((prev) => prev.filter((row) => row.id !== id));
    } catch {
      window.alert("The doc could not be deleted. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="bg-white/88 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Team Docs</p>
            <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-text-primary md:text-[38px]">
              Reference material for the work,
              <br />
              not another noisy feed.
            </h1>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-text-secondary">
              {projectName
                ? `Docs are currently scoped to ${projectName}. Use them for structured notes, decisions, experiment write-ups, and knowledge the team should revisit.`
                : "You are browsing docs in Personal workspace. Switch into a project when the team should be able to see them."}
            </p>
            <div className="mt-6">
              <div className="flex flex-wrap gap-2.5">
                <Link
                  href="/shared/new?type=article"
                  className="rounded-full bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"
                >
                  New doc
                </Link>
                <Link
                  href="/shared/new?type=article&preset=paper-review"
                  className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
                >
                  New paper review
                </Link>
              </div>
            </div>
          </div>

          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-2 lg:grid-cols-1">
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Visible docs</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{rows.length}</p>
              <p className="mt-1 text-sm text-text-secondary">The documents loaded for the active workspace.</p>
            </div>
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Scope</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">
                {projectName ?? "Personal"}
              </p>
              <p className="mt-1 text-sm text-text-secondary">Docs remain filtered to the current project context.</p>
            </div>
          </div>
        </div>
      </GlassCard>

      {loading ? (
        <p className="text-sm text-text-muted">Loading docs...</p>
      ) : rows.length === 0 ? (
        <GlassCard>
          <p className="text-sm text-text-primary">No docs yet.</p>
          <p className="mt-1 text-sm text-text-secondary">Write the first document when something needs a durable explanation.</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {rows.map((row) => {
            const canDelete =
              currentUser?.role === "admin" || (Boolean(currentUser?.id) && currentUser?.id === row.user_id);
            const authorColor = resolveMemberColor(row.user_id, row.author_member_color);

            return (
              <div key={row.id} className="group relative">
                <Link href={`/shared/articles/${row.id}`}>
                  <GlassCard variant="interactive">
                    <div className="mb-3 flex items-center gap-2">
                      <span
                        className="rounded-full border px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          backgroundColor: articleTone.bg,
                          borderColor: articleTone.border,
                          color: articleTone.text,
                        }}
                      >
                        Doc
                      </span>
                      <span
                        className="rounded-full border px-2 py-0.5 text-[11px]"
                        style={{
                          backgroundColor: hexToRgba(articleTone.base, 0.08),
                          borderColor: hexToRgba(articleTone.base, 0.24),
                          color: articleTone.base,
                        }}
                      >
                        {row.view_count} views
                      </span>
                    </div>

                    {row.cover_image_url ? (
                      <div className="mb-3 overflow-hidden rounded-xl border border-black/[0.06] bg-black/[0.03]">
                        <Image
                          src={row.cover_image_url}
                          alt={`${row.title} cover`}
                          width={1200}
                          height={704}
                          className="h-44 w-full object-cover"
                          sizes="(min-width: 1024px) 50vw, 100vw"
                        />
                      </div>
                    ) : null}

                    <h3 className="pr-8 text-base font-semibold text-text-primary">{row.title}</h3>
                    <p className="mt-2 line-clamp-3 text-sm text-text-secondary">
                      {row.preview || "No summary yet."}
                    </p>

                    <div className="mt-3 flex items-center gap-2">
                      <UserAvatar
                        displayName={row.author_name}
                        avatarUrl={row.author_avatar_url}
                        userId={row.user_id}
                        memberColor={row.author_member_color}
                        className="h-6 w-6 shrink-0 text-[10px]"
                        alt=""
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium" style={{ color: authorColor }}>
                          {row.author_name ?? "Unknown"}
                          {row.author_pronouns ? ` · ${row.author_pronouns}` : ""}
                        </p>
                        <p className="truncate text-[11px] text-text-muted">
                          {row.author_status_message || formatWhen(row.updated_at)}
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                </Link>

                {canDelete ? (
                  <button
                    onClick={(event) => void handleDelete(event, row.id)}
                    disabled={deletingId === row.id}
                    title="Delete doc"
                    className="absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-xs text-red-500 opacity-0 shadow-sm transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 disabled:opacity-50"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
