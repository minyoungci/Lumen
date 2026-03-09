"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { api } from "@/lib/api";
import { resolveMemberColor } from "@/lib/memberColor";
import { isPaperReviewTitle, stripPaperReviewPrefix } from "@/lib/paperReview";
import { useProjectStore } from "@/store/project";

interface SharedArticle {
  id: string;
  user_id: string;
  title: string;
  preview: string;
  author_name?: string | null;
  author_avatar_url?: string | null;
  author_member_color?: string | null;
  updated_at?: string | null;
  view_count: number;
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

export default function PaperReviewsPage() {
  const { currentProjectId, projects } = useProjectStore();
  const [rows, setRows] = useState<SharedArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get("/shared-posts", {
          params: {
            type: "article",
            limit: 100,
            project_id: currentProjectId ?? undefined,
          },
        });

        if (!mounted) return;
        setRows((res.data?.data ?? []) as SharedArticle[]);
      } catch {
        if (!mounted) return;
        setRows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [currentProjectId]);

  const projectName = useMemo(
    () => projects.find((project) => project.id === currentProjectId)?.name ?? null,
    [currentProjectId, projects],
  );

  const reviewRows = useMemo(
    () =>
      rows
        .filter((row) => isPaperReviewTitle(row.title))
        .sort((left, right) => (right.updated_at ?? "").localeCompare(left.updated_at ?? "")),
    [rows],
  );
  const recentDocs = rows.slice(0, 4);

  return (
    <div className="space-y-5">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="bg-white/88 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Paper Reviews</p>
            <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-text-primary md:text-[38px]">
              Review papers with structure,
              <br />
              then keep the takeaway reusable.
            </h1>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-text-secondary">
              Paper reviews are stored as team docs. Start from the structured review template and the page will save the
              review title in a consistent format automatically.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link
                href="/shared/new?type=article&preset=paper-review"
                className="rounded-[12px] bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"
              >
                Start review
              </Link>
              <Link
                href="/shared/articles"
                className="rounded-[12px] border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
              >
                Open docs
              </Link>
            </div>
          </div>

          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-3 lg:grid-cols-1">
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Scope</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">
                {projectName ?? "Personal"}
              </p>
              <p className="mt-1 text-sm text-text-secondary">Reviews stay filtered to the active workspace.</p>
            </div>
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Review docs</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{reviewRows.length}</p>
              <p className="mt-1 text-sm text-text-secondary">Docs already using the paper review naming pattern.</p>
            </div>
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Docs in scope</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{rows.length}</p>
              <p className="mt-1 text-sm text-text-secondary">All team docs loaded for the current workspace.</p>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <GlassCard className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Review library</p>
              <p className="mt-2 text-sm text-text-secondary">
                Reviews created from this flow stay grouped here automatically with a consistent paper review title.
              </p>
            </div>
            <Link href="/shared/new?type=article&preset=paper-review" className="text-xs font-medium text-primary-600 hover:underline">
              New review
            </Link>
          </div>

          {loading ? (
            <p className="text-sm text-text-muted">Loading paper reviews...</p>
          ) : reviewRows.length === 0 ? (
            <div className="space-y-3">
              <div className="workspace-inset px-4 py-5">
                <p className="text-sm font-medium text-text-primary">No paper reviews yet.</p>
                <p className="mt-1 text-sm text-text-secondary">
                  Start the first review from the template so the team has a consistent reading record.
                </p>
              </div>

              {recentDocs.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Recent docs in scope</p>
                  {recentDocs.map((row) => (
                    <Link
                      key={row.id}
                      href={`/shared/articles/${row.id}`}
                      className="workspace-row block px-4 py-3 transition-colors hover:bg-white"
                    >
                      <p className="line-clamp-1 text-sm font-medium text-text-primary">{row.title}</p>
                      <p className="mt-1 text-xs text-text-muted">{formatWhen(row.updated_at)}</p>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2.5">
              {reviewRows.map((row) => {
                const authorColor = resolveMemberColor(row.user_id, row.author_member_color);

                return (
                  <Link
                    key={row.id}
                    href={`/shared/articles/${row.id}`}
                    className="workspace-row block px-4 py-4 transition-colors hover:bg-white"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-[10px] border border-primary-200 bg-primary-50 px-2 py-0.5 text-[10px] font-medium text-primary-700">
                            Paper review
                          </span>
                          <span className="text-[11px] text-text-muted">{row.view_count} views</span>
                        </div>
                        <p className="mt-2 line-clamp-1 text-base font-semibold text-text-primary">
                          {stripPaperReviewPrefix(row.title) || row.title}
                        </p>
                        <p className="mt-1.5 line-clamp-3 text-sm text-text-secondary">
                          {row.preview || "No summary yet."}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-text-muted">{formatWhen(row.updated_at)}</span>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <UserAvatar
                        displayName={row.author_name}
                        avatarUrl={row.author_avatar_url}
                        userId={row.user_id}
                        memberColor={row.author_member_color}
                        className="h-6 w-6 shrink-0 text-[10px]"
                        alt=""
                      />
                      <p className="truncate text-xs font-medium" style={{ color: authorColor }}>
                        {row.author_name ?? "Unknown"}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </GlassCard>

        <div className="space-y-5">
          <GlassCard className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Review rubric</p>
            <div className="space-y-3">
              <div className="workspace-inset px-4 py-4">
                <p className="text-sm font-medium text-text-primary">1. Core claim</p>
                <p className="mt-1 text-sm text-text-secondary">State the paper&apos;s claim in one or two sentences without repeating the abstract.</p>
              </div>
              <div className="workspace-inset px-4 py-4">
                <p className="text-sm font-medium text-text-primary">2. Methods and evidence</p>
                <p className="mt-1 text-sm text-text-secondary">Capture only the setup details needed to judge whether the result should be trusted.</p>
              </div>
              <div className="workspace-inset px-4 py-4">
                <p className="text-sm font-medium text-text-primary">3. Team takeaway</p>
                <p className="mt-1 text-sm text-text-secondary">Decide whether the team should adopt, test, ignore, or watch this work.</p>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Good habits</p>
            <div className="space-y-3">
              <div className="workspace-inset px-4 py-4">
                <p className="text-sm font-medium text-text-primary">Keep the title pattern</p>
                <p className="mt-1 text-sm text-text-secondary">The review flow saves `Paper review - [paper title]` for you so the library stays grouped.</p>
              </div>
              <div className="workspace-inset px-4 py-4">
                <p className="text-sm font-medium text-text-primary">Write for the next reader</p>
                <p className="mt-1 text-sm text-text-secondary">Assume someone will skim this review before a meeting and needs your judgment fast.</p>
              </div>
              <Link
                href="/shared/new?type=article&preset=paper-review"
                className="workspace-inset block px-4 py-4 transition-colors hover:bg-white"
              >
                <p className="text-sm font-medium text-text-primary">Use the review template</p>
                <p className="mt-1 text-sm text-text-secondary">Start with the full scaffold instead of rewriting the same review sections each time.</p>
              </Link>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
