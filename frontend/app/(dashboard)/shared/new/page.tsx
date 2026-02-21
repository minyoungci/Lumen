"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GlassCard } from "@/components/shared/GlassCard";
import { RichTextEditor, TiptapContent } from "@/components/shared/RichTextEditor";
import { api } from "@/lib/api";

interface Column {
  id: string;
  name: string;
}

export default function NewSharedPostPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialType = searchParams.get("type") === "kanban" ? "kanban" : "article";
  const [type, setType] = useState<"article" | "kanban">(initialType);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const [columns, setColumns] = useState<Column[]>([]);
  const [kanbanColumn, setKanbanColumn] = useState("");

  const contentRef = useRef<{ json: TiptapContent | null; text: string }>({ json: null, text: "" });
  const [wordCount, setWordCount] = useState(0);

  useEffect(() => {
    if (type !== "kanban") return;
    api.get("/kanban/columns")
      .then((res) => {
        const cols: Column[] = res.data?.data ?? [];
        setColumns(cols);
        if (!kanbanColumn && cols[0]?.name) setKanbanColumn(cols[0].name);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const handleEditorChange = (json: TiptapContent, text: string) => {
    contentRef.current = { json, text };
    setWordCount(text.trim().split(/\s+/).filter(Boolean).length);
  };

  const readingTime = Math.max(1, Math.ceil(wordCount / 220));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    try {
      const { json, text } = contentRef.current;
      const res = await api.post("/shared-posts", {
        type,
        title: title.trim(),
        content: { text, tiptap: json },
        word_count: wordCount,
        reading_time: readingTime,
        ...(type === "kanban" ? { kanban_column: kanbanColumn || null } : {}),
      });
      const id = res.data?.data?.id;
      if (id && type === "article") router.push(`/shared/articles/${id}`);
      else if (id) router.push("/shared/kanban");
      else router.push(type === "article" ? "/shared/articles" : "/shared/kanban");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">New Shared Post</h1>
      <GlassCard>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-white/70">Type</label>
            <select
              className="input w-full"
              value={type}
              onChange={(e) => setType(e.target.value as "article" | "kanban")}
            >
              <option value="article">Article</option>
              <option value="kanban">Kanban Card</option>
            </select>
          </div>

          <input
            className="input w-full"
            placeholder="제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          {type === "kanban" && (
            <div>
              <label className="mb-1 block text-sm text-white/70">Column</label>
              <select
                className="input w-full"
                value={kanbanColumn}
                onChange={(e) => setKanbanColumn(e.target.value)}
              >
                {columns.length === 0 && (
                  <option value="">컬럼 없음</option>
                )}
                {columns.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {type === "article" && (
            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
              <RichTextEditor
                onChange={handleEditorChange}
                placeholder="아티클 내용을 입력하세요"
                className="min-h-[280px]"
              />
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-white/50">
            {type === "article" ? (
              <span>{wordCount} words · {readingTime} min read</span>
            ) : (
              <span />
            )}
            <button
              disabled={saving}
              className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Saving..." : "Create"}
            </button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}
