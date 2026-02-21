"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/shared/GlassCard";
import { RichTextEditor, TiptapContent } from "@/components/shared/RichTextEditor";
import { api } from "@/lib/api";

export default function NewResearchNotePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contentRef = useRef<{ json: TiptapContent | null; text: string }>({ json: null, text: "" });
  const [wordCount, setWordCount] = useState(0);

  const handleEditorChange = (json: TiptapContent, text: string) => {
    contentRef.current = { json, text };
    setWordCount(text.trim().split(/\s+/).filter(Boolean).length);
  };

  const readingTime = Math.max(1, Math.ceil(wordCount / 220));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const { json, text } = contentRef.current;
      const res = await api.post("/research-notes", {
        title: title.trim(),
        content: { text, tiptap: json },
        is_shared: isShared,
        word_count: wordCount,
        reading_time: readingTime,
      });
      const id = res.data?.data?.id;
      if (id) router.push(`/research-notes/${id}`);
      else router.push("/research-notes");
    } catch {
      setError("저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold">New Research Note</h1>
      <GlassCard>
        <form className="space-y-4" onSubmit={onSubmit}>
          <input
            className="input w-full text-lg"
            placeholder="Untitled Note"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <RichTextEditor
              onChange={handleEditorChange}
              placeholder="노트 내용을 입력하세요"
              className="min-h-[420px]"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-white/70">
            <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} />
            Shared로 공개
          </label>

          <div className="flex items-center justify-between text-xs text-white/50">
            <span>{wordCount} words · {readingTime} min read</span>
            <button
              disabled={saving}
              className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Saving..." : "Create Note"}
            </button>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>
      </GlassCard>
    </div>
  );
}
