"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { GlassCard } from "@/components/shared/GlassCard";
import { KnowledgeAssistPanel } from "@/components/shared/KnowledgeAssistPanel";
import { RichTextEditor, TiptapContent, textToTiptap } from "@/components/shared/RichTextEditor";
import { api } from "@/lib/api";

interface NoteDetail {
  id: string;
  title: string;
  content: Record<string, unknown>;
  is_shared: boolean;
  is_pinned: boolean;
  word_count: number;
  reading_time: number;
  updated_at?: string;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function formatWhen(value?: string): string {
  if (!value) return "Recently";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ResearchNoteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [note, setNote] = useState<NoteDetail | null>(null);
  const [title, setTitle] = useState("");
  const [contentJson, setContentJson] = useState<TiptapContent | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [isShared, setIsShared] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [wordCount, setWordCount] = useState(0);
  const [editorText, setEditorText] = useState("");

  const contentRef = useRef<{ json: TiptapContent | null; text: string }>({ json: null, text: "" });

  const readingTime = Math.max(1, Math.ceil(wordCount / 220));

  useEffect(() => {
    let mounted = true;
    if (!id) return;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.get(`/research-notes/${id}`);
        const row = response.data?.data as NoteDetail | undefined;
        if (!mounted || !row) return;

        const text = typeof row.content?.text === "string" ? row.content.text : "";
        const tiptap =
          (row.content?.tiptap as TiptapContent | undefined) ?? textToTiptap(text);

        setNote(row);
        setTitle(row.title ?? "");
        setContentJson(tiptap);
        contentRef.current = { json: tiptap, text };
        setEditorText(text);
        setWordCount(countWords(text));
        setIsShared(Boolean(row.is_shared));
        setIsPinned(Boolean(row.is_pinned));
        setEditorKey((value) => value + 1);
      } catch {
        if (mounted) {
          setNote(null);
          setError("The note could not be loaded.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [id]);

  const handleEditorChange = (json: TiptapContent, text: string) => {
    contentRef.current = { json, text };
    setContentJson(json);
    setEditorText(text);
    setWordCount(countWords(text));
  };

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || saving) return;

    setSaving(true);
    setError(null);

    try {
      const { json, text } = contentRef.current;
      const response = await api.patch(`/research-notes/${id}`, {
        title: title.trim(),
        content: { text, tiptap: json },
        is_shared: isShared,
        is_pinned: isPinned,
        word_count: wordCount,
        reading_time: readingTime,
      });

      const updated = response.data?.data as NoteDetail | undefined;
      setNote(updated ?? note);
      setTitle((updated?.title ?? title).trim() || title);
      setContentJson(json);
      setEditorText(text);
      setWordCount(countWords(text));
    } catch {
      setError("The note could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!id) return;
    if (!window.confirm("Delete this note? This cannot be undone.")) return;

    try {
      await api.delete(`/research-notes/${id}`);
      router.push("/research-notes");
    } catch {
      setError("The note could not be deleted.");
    }
  };

  if (loading) {
    return <p className="text-sm text-text-muted">Loading note...</p>;
  }

  if (!note) {
    return (
      <GlassCard>
        <p className="text-sm font-medium text-text-primary">Note not found.</p>
        <p className="mt-1 text-sm text-text-secondary">
          The note may have been removed or you may not have access to it.
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-5">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="bg-white/88 px-6 py-6">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              <span>Research note</span>
              <span className="h-1 w-1 rounded-full bg-black/20" />
              <span>{isShared ? "Shared" : "Private"}</span>
              {isPinned ? (
                <>
                  <span className="h-1 w-1 rounded-full bg-black/20" />
                  <span>Pinned</span>
                </>
              ) : null}
            </div>
            <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-text-primary md:text-[38px]">
              {title.trim() || "Untitled note"}
            </h1>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-text-secondary">
              Use edit mode when the note is still changing. Use preview mode to check how readable the current draft is
              before you share it more widely.
            </p>
          </div>

          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-2 lg:grid-cols-1">
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Updated</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">
                {formatWhen(note.updated_at)}
              </p>
              <p className="mt-1 text-sm text-text-secondary">The latest saved version of this note.</p>
            </div>
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Length</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{wordCount} words</p>
              <p className="mt-1 text-sm text-text-secondary">{readingTime} min read at the current draft length.</p>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <GlassCard>
          <div className="flex flex-col gap-3 border-b border-black/[0.06] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {[
                { key: "edit" as const, label: "Edit" },
                { key: "preview" as const, label: "Preview" },
              ].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setViewMode(option.key)}
                  className={`rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
                    viewMode === option.key
                      ? "border-primary-500/40 bg-primary-500/10 text-primary-700"
                      : "border-black/10 bg-white text-text-secondary hover:bg-black/[0.03] hover:text-text-primary"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/research-notes"
                className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
              >
                Back to notes
              </Link>
              <button
                type="button"
                onClick={onDelete}
                className="rounded-full border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
              >
                Delete
              </button>
            </div>
          </div>

          {viewMode === "preview" ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-[24px] border border-black/[0.08] bg-white/70 p-4">
                <RichTextEditor key={`preview-${note.id}-${viewMode}`} initialContent={contentJson} readOnly />
              </div>
              <p className="text-xs text-text-muted">
                Preview uses the current draft, including unsaved edits made during this session.
              </p>
            </div>
          ) : (
            <form onSubmit={onSave} className="mt-5 space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-text-primary">Title</label>
                <input
                  className="input w-full text-base"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Name the note clearly"
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-text-primary">Visibility and priority</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setIsShared((value) => !value)}
                    className={`rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
                      isShared
                        ? "border-primary-500/40 bg-primary-500/10 text-primary-700"
                        : "border-black/10 bg-white text-text-secondary hover:bg-black/[0.03] hover:text-text-primary"
                    }`}
                  >
                    {isShared ? "Shared with team" : "Private draft"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPinned((value) => !value)}
                    className={`rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
                      isPinned
                        ? "border-amber-300/50 bg-amber-500/10 text-amber-700"
                        : "border-black/10 bg-white text-text-secondary hover:bg-black/[0.03] hover:text-text-primary"
                    }`}
                  >
                    {isPinned ? "Pinned" : "Pin note"}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-text-primary">Body</label>
                <div className="rounded-[24px] border border-black/[0.08] bg-white/70 p-4">
                  <RichTextEditor
                    key={`editor-${editorKey}`}
                    initialContent={contentJson}
                    onChange={handleEditorChange}
                    placeholder="Keep the reasoning legible while the work is still moving."
                    className="min-h-[430px]"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-black/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-text-muted">
                  {wordCount} words | {readingTime} min read
                </p>
                <button
                  type="submit"
                  disabled={saving || !title.trim()}
                  className="rounded-full bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save note"}
                </button>
              </div>

              {error ? <p className="text-sm text-red-500">{error}</p> : null}
            </form>
          )}
        </GlassCard>

        <div className="space-y-4">
          <GlassCard className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Draft state</p>
              <p className="mt-2 text-sm font-medium text-text-primary">
                {viewMode === "edit" ? "Editing the current note" : "Reviewing the current draft"}
              </p>
            </div>
            <div className="rounded-2xl border border-black/[0.06] bg-black/[0.03] p-3 text-xs text-text-muted">
              Shared notes stay in the notes library. Move stable, team-facing content into Team Docs when it becomes a
              durable reference.
            </div>
          </GlassCard>

          <KnowledgeAssistPanel query={`${title}\n${editorText}`} topK={7} />
        </div>
      </div>
    </div>
  );
}
