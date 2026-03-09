"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { api } from "@/lib/api";
import { isPaperReviewTitle } from "@/lib/paperReview";
import { useProjectStore } from "@/store/project";

interface SharedPostSummary {
  id: string;
  type: string;
  title: string;
  preview: string;
  updated_at?: string | null;
  kanban_column?: string | null;
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

export default function SharedSpacePage() {
  const { currentProjectId, projects } = useProjectStore();
  const [rows, setRows] = useState<SharedPostSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get("/shared-posts", {
          params: {
            limit: 12,
            project_id: currentProjectId ?? undefined,
          },
        });

        if (!mounted) return;
        setRows((res.data?.data ?? []) as SharedPostSummary[]);
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

  const docRows = rows.filter((row) => row.type === "article").slice(0, 4);
  const updateRows = rows.filter((row) => row.type === "kanban" || row.type === "insight").slice(0, 4);
  const docCount = rows.filter((row) => row.type === "article").length;
  const updateCount = rows.filter((row) => row.type === "kanban" || row.type === "insight").length;
  const reviewCount = rows.filter((row) => row.type === "article" && isPaperReviewTitle(row.title)).length;
  const scopeLabel = projectName ? `${projectName} team space` : "Personal workspace";

  return (
    <div className="space-y-5">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1.15fr)_340px]">
          <div className="bg-white/88 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Team Space</p>
            <h1 className="mt-4 text-[32px] font-semibold tracking-[-0.04em] text-text-primary md:text-[40px]">
              Share the work once.
              <br />
              Keep the context reusable.
            </h1>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-text-secondary">
              {projectName
                ? `${projectName} is the active project. Docs hold the durable thinking, and updates keep the running conversation lightweight.`
                : "You are in Personal workspace. Move into a project when the work is ready for the team."}
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link
                href="/shared/new?type=article"
                className="rounded-[12px] bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"
              >
                New doc
              </Link>
              <Link
                href="/shared/new?type=kanban"
                className="rounded-[12px] border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
              >
                Post update
              </Link>
              <Link
                href="/shared/feed"
                className="rounded-[12px] border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
              >
                Open updates
              </Link>
              <Link
                href="/shared/paper-reviews"
                className="rounded-[12px] border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
              >
                Paper reviews
              </Link>
            </div>
          </div>

          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-3 lg:grid-cols-1">
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Scope</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{scopeLabel}</p>
              <p className="mt-1 text-sm text-text-secondary">Everything here stays tied to the current project context.</p>
            </div>
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Docs</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{docCount}</p>
              <p className="mt-1 text-sm text-text-secondary">Recent documents teammates can return to later.</p>
            </div>
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Updates</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{updateCount}</p>
              <p className="mt-1 text-sm text-text-secondary">Quick progress signals that do not need a full note.</p>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px]">
        <GlassCard className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Docs</p>
              <p className="mt-2 text-sm text-text-secondary">
                Use docs for decisions, experiments, references, and anything the team should be able to cite later.
              </p>
            </div>
            <Link href="/shared/articles" className="text-xs font-medium text-primary-600 hover:underline">
              Open docs
            </Link>
          </div>

          {loading ? (
            <p className="text-sm text-text-muted">Loading recent docs...</p>
          ) : docRows.length === 0 ? (
            <div className="workspace-inset px-4 py-5">
              <p className="text-sm text-text-primary">No docs yet.</p>
              <p className="mt-1 text-sm text-text-secondary">Start a doc when a thought should outlive chat.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {docRows.map((row) => (
                <Link
                  key={row.id}
                  href={`/shared/articles/${row.id}`}
                  className="workspace-row block px-4 py-3 transition-colors hover:bg-white"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="line-clamp-1 text-sm font-medium text-text-primary">{row.title}</p>
                    <span className="rounded-[10px] bg-amber-500/12 px-2 py-1 text-[10px] font-medium text-amber-700">
                      Doc
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm text-text-secondary">
                    {row.preview || "No summary yet."}
                  </p>
                  <p className="mt-2 text-xs text-text-muted">{formatWhen(row.updated_at)}</p>
                </Link>
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Updates</p>
              <p className="mt-2 text-sm text-text-secondary">
                Keep the feed short. A good update tells the team what changed and what needs attention next.
              </p>
            </div>
            <Link href="/shared/feed" className="text-xs font-medium text-primary-600 hover:underline">
              Open feed
            </Link>
          </div>

          {loading ? (
            <p className="text-sm text-text-muted">Loading recent updates...</p>
          ) : updateRows.length === 0 ? (
            <div className="workspace-inset px-4 py-5">
              <p className="text-sm text-text-primary">No updates yet.</p>
              <p className="mt-1 text-sm text-text-secondary">Post small progress here instead of turning everything into a document.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {updateRows.map((row) => (
                <Link
                  key={row.id}
                  href={`/shared/feed/${row.id}`}
                  className="workspace-row block px-4 py-3 transition-colors hover:bg-white"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="line-clamp-1 text-sm font-medium text-text-primary">{row.title}</p>
                    <span className="rounded-[10px] bg-primary-500/10 px-2 py-1 text-[10px] font-medium text-primary-700">
                      {row.kanban_column ? `#${row.kanban_column}` : "Update"}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm text-text-secondary">
                    {row.preview || "No summary yet."}
                  </p>
                  <p className="mt-2 text-xs text-text-muted">{formatWhen(row.updated_at)}</p>
                </Link>
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Paper Reviews</p>
              <p className="mt-2 text-sm text-text-secondary">
                Use one shared structure for literature reviews so the team can compare papers faster.
              </p>
            </div>
            <Link href="/shared/paper-reviews" className="text-xs font-medium text-primary-600 hover:underline">
              Open reviews
            </Link>
          </div>

          <div className="space-y-3">
            <div className="workspace-inset px-4 py-4">
              <p className="text-sm font-medium text-text-primary">Visible reviews</p>
              <p className="mt-1 text-sm text-text-secondary">
                {reviewCount > 0
                  ? `${reviewCount} review docs are already grouped under the structured paper review flow.`
                  : "No paper review docs yet. Start the first one from the review template."}
              </p>
            </div>
            <div className="workspace-inset px-4 py-4">
              <p className="text-sm font-medium text-text-primary">Review template</p>
              <p className="mt-1 text-sm text-text-secondary">Capture the claim, methods, evidence, weaknesses, and the team takeaway in one pass.</p>
            </div>
            <Link
              href="/shared/new?type=article&preset=paper-review"
              className="workspace-inset block px-4 py-4 transition-colors hover:bg-white"
            >
              <p className="text-sm font-medium text-text-primary">Start a paper review</p>
              <p className="mt-1 text-sm text-text-secondary">Open the structured paper review template inside a team doc.</p>
            </Link>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
