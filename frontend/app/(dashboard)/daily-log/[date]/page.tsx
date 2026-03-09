"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { GlassCard } from "@/components/shared/GlassCard";
import { RichTextEditor, TiptapContent, textToTiptap } from "@/components/shared/RichTextEditor";
import { api } from "@/lib/api";
import { useProjectStore } from "@/store/project";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  private: "Private",
  shared: "Shared",
};

const STATUS_TONE: Record<string, string> = {
  draft: "border-amber-200/80 bg-amber-50 text-amber-700",
  private: "border-black/10 bg-black/[0.04] text-text-muted",
  shared: "border-blue-200/80 bg-blue-50 text-blue-700",
};

function countWordsFromContent(content?: TiptapContent | null): number {
  if (!content) return 0;
  const walk = (node: TiptapContent | null | undefined): string => {
    if (!node) return "";
    if (node.type === "text" && typeof node.text === "string") return node.text;
    if (!Array.isArray(node.content)) return "";
    return node.content.map((child) => walk(child as TiptapContent)).join(" ");
  };
  return walk(content).trim().split(/\s+/).filter(Boolean).length;
}

function formatWhen(value?: string | null): string {
  if (!value) return "Recently";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DailyLogByDatePage() {
  const { date } = useParams<{ date: string }>();
  const router = useRouter();
  const { currentProjectId } = useProjectStore();
  const [logId, setLogId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<string>("draft");
  const [wordCount, setWordCount] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [content, setContent] = useState<TiptapContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!date) return;

    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/daily-logs/${date}`, {
          params: { project_id: currentProjectId ?? undefined },
        });
        const row = res.data?.data;
        const raw = row?.content;
        const tiptap: TiptapContent =
          raw?.tiptap ?? textToTiptap(typeof raw?.text === "string" ? raw.text : "");

        if (!mounted) return;

        setLogId(typeof row?.id === "string" ? row.id : null);
        setContent(tiptap);
        setTitle(typeof raw?.title === "string" ? raw.title : "");
        setStatus(typeof row?.status === "string" ? row.status : "draft");
        setWordCount(typeof row?.word_count === "number" ? row.word_count : countWordsFromContent(tiptap));
        setUpdatedAt(typeof row?.updated_at === "string" ? row.updated_at : null);
      } catch {
        if (!mounted) return;
        setLogId(null);
        setContent(textToTiptap(""));
        setTitle("");
        setStatus("draft");
        setWordCount(0);
        setUpdatedAt(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [date, currentProjectId]);

  const effectiveTitle = useMemo(() => title.trim() || `${date} log`, [date, title]);
  const readingTime = Math.max(1, Math.ceil(wordCount / 220));

  const handleDelete = async () => {
    if (!logId) return;
    if (!window.confirm("Delete this daily log? This action cannot be undone.")) return;

    setDeleting(true);
    try {
      await api.delete(`/daily-logs/${logId}`);
      router.push("/daily-log/archive");
    } catch {
      window.alert("Delete failed. Try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="bg-white/88 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Journal entry</p>
            <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-text-primary md:text-[38px]">
              {effectiveTitle}
            </h1>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-text-secondary">
              Open the saved log as a reading view, then jump back into edit only when the entry needs an update.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link
                href={`/daily-log?date=${date}`}
                className="rounded-[12px] bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"
              >
                Edit this day
              </Link>
              <Link
                href="/daily-log/archive"
                className="rounded-[12px] border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
              >
                Open archive
              </Link>
            </div>
          </div>

          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-3 lg:grid-cols-1">
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Status</p>
              <div className="mt-3">
                <span
                  className={`rounded-[10px] border px-2 py-1 text-xs font-medium ${
                    STATUS_TONE[status] ?? STATUS_TONE.draft
                  }`}
                >
                  {STATUS_LABEL[status] ?? status}
                </span>
              </div>
            </div>
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Length</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{wordCount}</p>
              <p className="mt-1 text-sm text-text-secondary">{readingTime} min read</p>
            </div>
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Updated</p>
              <p className="mt-3 text-lg font-semibold text-text-primary">{formatWhen(updatedAt)}</p>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href="/daily-log"
          className="rounded-[12px] border border-black/10 bg-white/80 px-3.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-white hover:text-text-primary"
        >
          Open today
        </Link>
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={!logId || deleting}
          className="rounded-[12px] border border-red-200/80 bg-red-50 px-3.5 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-40"
        >
          {deleting ? "Deleting..." : "Delete"}
        </button>
      </div>

      <GlassCard className="space-y-4">
        <div className="border-b border-black/[0.07] pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Saved content</p>
          <h2 className="mt-2 text-xl font-semibold text-text-primary">{effectiveTitle}</h2>
        </div>

        {loading ? (
          <p className="text-sm text-text-muted">Loading entry...</p>
        ) : content ? (
          <div className="medium-prose">
            <RichTextEditor initialContent={content} readOnly className="min-h-0" />
          </div>
        ) : (
          <div className="rounded-[18px] border border-dashed border-black/10 bg-white/50 p-8 text-center text-sm text-text-muted">
            No saved content for this day.
          </div>
        )}
      </GlassCard>
    </div>
  );
}
