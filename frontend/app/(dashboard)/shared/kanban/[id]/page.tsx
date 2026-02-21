"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { GlassCard } from "@/components/shared/GlassCard";
import { RichTextEditor, TiptapContent, textToTiptap } from "@/components/shared/RichTextEditor";
import { api } from "@/lib/api";

interface Column {
  id: string;
  name: string;
}

export default function SharedKanbanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [kanbanColumn, setKanbanColumn] = useState<string>("");
  const [columns, setColumns] = useState<Column[]>([]);
  const [initialContent, setInitialContent] = useState<TiptapContent | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"read" | "edit">("read");

  const contentRef = useRef<{ json: TiptapContent | null; text: string }>({ json: null, text: "" });

  useEffect(() => {
    let mounted = true;
    if (!id) return;

    const load = async () => {
      try {
        const [postRes, colRes] = await Promise.all([
          api.get(`/shared-posts/${id}`),
          api.get("/kanban/columns"),
        ]);
        if (!mounted) return;

        const row = postRes.data?.data;
        if (!row) return;

        const tiptap: TiptapContent =
          row.content?.tiptap ?? textToTiptap(typeof row.content?.text === "string" ? row.content.text : "");
        const text = typeof row.content?.text === "string" ? row.content.text : "";

        setTitle(row.title || "");
        setKanbanColumn(row.kanban_column ?? "");
        setInitialContent(tiptap);
        setEditorKey((k) => k + 1);
        contentRef.current = { json: tiptap, text };
        setColumns(colRes.data?.data ?? []);
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
        kanban_column: kanbanColumn || null,
      });
      setViewMode("read");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!id) return;
    if (!window.confirm("삭제하시겠습니까?")) return;
    await api.delete(`/shared-posts/${id}`);
    router.push("/shared/kanban");
  };

  if (loading) return <p className="text-sm text-white/60">불러오는 중...</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold">
            {viewMode === "read" ? title || "Kanban Card" : "Edit Card"}
          </h1>
          {kanbanColumn && (
            <p className="text-xs text-white/50">Column: {kanbanColumn}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode((m) => (m === "read" ? "edit" : "read"))}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:text-white"
          >
            {viewMode === "read" ? "✏️ Edit" : "👁 Read"}
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
        {viewMode === "read" ? (
          <article className="space-y-3">
            <div className="border-b border-white/10 pb-3">
              <h2 className="text-xl font-semibold text-white">{title}</h2>
            </div>
            <RichTextEditor
              key={`read-${editorKey}`}
              initialContent={initialContent}
              readOnly
            />
          </article>
        ) : (
          <form onSubmit={onSave} className="space-y-4">
            <input
              className="input w-full text-lg"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목"
            />

            <div>
              <label className="mb-1 block text-sm text-white/70">Column</label>
              <select
                className="input w-full"
                value={kanbanColumn}
                onChange={(e) => setKanbanColumn(e.target.value)}
              >
                <option value="">미분류</option>
                {columns.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
              <RichTextEditor
                key={editorKey}
                initialContent={initialContent}
                onChange={handleEditorChange}
                placeholder="카드 내용을 입력하세요"
                className="min-h-[300px]"
              />
            </div>

            <div className="flex justify-end">
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
