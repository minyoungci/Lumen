"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/shared/GlassCard";
import { RichTextEditor, TiptapContent, textToTiptap } from "@/components/shared/RichTextEditor";
import { api } from "@/lib/api";

function calcReadingTime(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

export default function SharedArticleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [initialContent, setInitialContent] = useState<TiptapContent | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"read" | "edit">("read");

  const contentRef = useRef<{ json: TiptapContent | null; text: string }>({ json: null, text: "" });
  const [wordCount, setWordCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    if (!id) return;

    const load = async () => {
      try {
        const res = await api.get(`/shared-posts/${id}`);
        const row = res.data?.data;
        if (!mounted || !row) return;

        const tiptap: TiptapContent =
          row.content?.tiptap ??
          textToTiptap(typeof row.content?.text === "string" ? row.content.text : "");
        const text = typeof row.content?.text === "string" ? row.content.text : "";

        setTitle(row.title || "");
        setAuthorName(row.author_name || row.created_by_name || "");
        setDateStr(
          row.created_at
            ? new Date(row.created_at).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : ""
        );
        setInitialContent(tiptap);
        setEditorKey((k) => k + 1);
        contentRef.current = { json: tiptap, text };
        setWordCount(text.trim().split(/\s+/).filter(Boolean).length);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => { mounted = false; };
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
      await api.patch(`/shared-posts/${id}`, {
        title,
        content: { text, tiptap: json },
      });
      setViewMode("read");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!id || !window.confirm("이 아티클을 삭제하시겠습니까?")) return;
    await api.delete(`/shared-posts/${id}`);
    router.push("/shared/articles");
  };

  if (loading) {
    return (
      <p className="py-20 text-center text-sm text-text-muted">불러오는 중...</p>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-[720px] py-8">
        {viewMode === "read" ? (
          /* ── Article read view ── */
          <article>
            <header className="mb-10 space-y-4">
              <h1 className="text-4xl font-bold leading-snug tracking-tight text-text-primary">
                {title || "Shared Article"}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
                {authorName && (
                  <span className="font-medium text-text-secondary">{authorName}</span>
                )}
                {authorName && dateStr && <span>·</span>}
                {dateStr && <span>{dateStr}</span>}
                <span>·</span>
                <span>{calcReadingTime(contentRef.current.text)} min read</span>
                <span>·</span>
                <span>{wordCount} words</span>
              </div>
              <div className="h-px bg-black/[0.08]" />
            </header>

            <div className="prose-article">
              <RichTextEditor
                key={`read-${editorKey}`}
                initialContent={initialContent}
                readOnly
              />
            </div>
          </article>
        ) : (
          /* ── Edit view ── */
          <GlassCard>
            <form onSubmit={onSave} className="space-y-4">
              <input
                className="input w-full text-lg font-semibold"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="제목을 입력하세요"
              />

              <div className="rounded-lg border border-black/[0.08] bg-black/[0.02] p-4">
                <RichTextEditor
                  key={editorKey}
                  initialContent={initialContent}
                  onChange={handleEditorChange}
                  placeholder="아티클 내용을 입력하세요"
                  className="min-h-[420px]"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>
                  {wordCount} words · {calcReadingTime(contentRef.current.text)} min read
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setViewMode("read")}
                    className="rounded-lg border border-black/10 px-3 py-1.5 text-sm text-text-secondary hover:bg-black/5 hover:text-text-primary transition-colors"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-60 transition-colors"
                  >
                    {saving ? "저장 중..." : "Save"}
                  </button>
                </div>
              </div>
            </form>
          </GlassCard>
        )}
      </div>

      {/* ── Floating action buttons (read mode) ── */}
      {viewMode === "read" && (
        <div className="fixed bottom-8 right-6 flex flex-col gap-2">
          <motion.button
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            onClick={() => setViewMode("edit")}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-500 text-white shadow-lg shadow-primary-500/25 hover:bg-primary-600 transition-colors"
            title="Edit"
            aria-label="Edit article"
          >
            ✏️
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            onClick={onDelete}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-red-200 bg-white text-red-500 shadow-md hover:bg-red-50 transition-colors"
            title="Delete"
            aria-label="Delete article"
          >
            🗑️
          </motion.button>
        </div>
      )}
    </>
  );
}
