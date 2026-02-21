"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { GlassCard } from "@/components/shared/GlassCard";
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
}

export default function ResearchNoteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [note, setNote] = useState<NoteDetail | null>(null);
  const [title, setTitle] = useState("");
  const [initialContent, setInitialContent] = useState<TiptapContent | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [isShared, setIsShared] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");

  const contentRef = useRef<{ json: TiptapContent | null; text: string }>({ json: null, text: "" });
  const [wordCount, setWordCount] = useState(0);

  const readingTime = Math.max(1, Math.ceil(wordCount / 220));

  useEffect(() => {
    let mounted = true;
    if (!id) return;

    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/research-notes/${id}`);
        const row = res.data?.data;
        if (!mounted || !row) return;

        const tiptap: TiptapContent =
          row.content?.tiptap ?? textToTiptap(typeof row.content?.text === "string" ? row.content.text : "");
        const text = typeof row.content?.text === "string" ? row.content.text : "";

        setNote(row);
        setTitle(row.title ?? "");
        setInitialContent(tiptap);
        setEditorKey((k) => k + 1);
        contentRef.current = { json: tiptap, text };
        setWordCount(text.trim().split(/\s+/).filter(Boolean).length);
        setIsShared(Boolean(row.is_shared));
        setIsPinned(Boolean(row.is_pinned));
      } catch {
        if (mounted) setNote(null);
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
    setWordCount(text.trim().split(/\s+/).filter(Boolean).length);
  };

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!id) return;

    setSaving(true);
    try {
      const { json, text } = contentRef.current;
      const res = await api.patch(`/research-notes/${id}`, {
        title,
        content: { text, tiptap: json },
        is_shared: isShared,
        is_pinned: isPinned,
        word_count: wordCount,
        reading_time: readingTime,
      });
      setNote(res.data?.data ?? null);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!id) return;
    if (!window.confirm("이 노트를 삭제하시겠습니까?")) return;
    await api.delete(`/research-notes/${id}`);
    router.push("/research-notes");
  };

  if (loading) return <p className="text-sm text-white/60">불러오는 중...</p>;
  if (!note) return <p className="text-sm text-white/60">노트를 찾을 수 없습니다.</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Research Note</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode((m) => (m === "edit" ? "preview" : "edit"))}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:text-white"
          >
            {viewMode === "edit" ? "👁 Preview" : "✏️ Edit"}
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          >
            Delete
          </button>
        </div>
      </div>

      <GlassCard>
        {viewMode === "preview" ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            <div className="rounded-lg border border-white/10 bg-black/10 p-4">
              <RichTextEditor
                key={`preview-${editorKey}`}
                initialContent={initialContent}
                readOnly
              />
            </div>
            <p className="text-xs text-white/50">{wordCount} words · {readingTime} min read</p>
          </div>
        ) : (
          <form onSubmit={onSave} className="space-y-4">
            <input
              className="input w-full text-lg"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
              <RichTextEditor
                key={editorKey}
                initialContent={initialContent}
                onChange={handleEditorChange}
                placeholder="노트 내용을 입력하세요"
                className="min-h-[430px]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-white/70">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} />
                Shared
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} />
                Pinned
              </label>
            </div>

            <div className="flex items-center justify-between text-xs text-white/50">
              <span>{wordCount} words · {readingTime} min read</span>
              <button
                disabled={saving}
                className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        )}
      </GlassCard>
    </div>
  );
}
