"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/shared/GlassCard";
import { KnowledgeAssistPanel } from "@/components/shared/KnowledgeAssistPanel";
import { RichTextEditor, TiptapContent } from "@/components/shared/RichTextEditor";
import { api } from "@/lib/api";

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function NewResearchNotePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [editorText, setEditorText] = useState("");

  const contentRef = useRef<{ json: TiptapContent | null; text: string }>({ json: null, text: "" });

  const readingTime = Math.max(1, Math.ceil(wordCount / 220));

  const handleEditorChange = (json: TiptapContent, text: string) => {
    contentRef.current = { json, text };
    setEditorText(text);
    setWordCount(countWords(text));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || saving) return;

    setSaving(true);
    setError(null);

    try {
      const { json, text } = contentRef.current;
      const response = await api.post("/research-notes", {
        title: title.trim(),
        content: { text, tiptap: json },
        is_shared: isShared,
        word_count: wordCount,
        reading_time: readingTime,
      });
      const id = response.data?.data?.id;
      router.push(id ? `/research-notes/${id}` : "/research-notes");
    } catch {
      setError("The note could not be created. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="bg-white/88 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">New note</p>
            <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-text-primary md:text-[38px]">
              Start with the thinking,
              <br />
              share when it is ready.
            </h1>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-text-secondary">
              Research notes are for draft reasoning, references, and work that still needs room to move. Keep the note
              private while it is forming, or make it shared when teammates should be able to find it.
            </p>
          </div>

          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-2 lg:grid-cols-1">
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Visibility</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">
                {isShared ? "Shared" : "Private"}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                Shared notes appear in the notes library for collaborators.
              </p>
            </div>
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Writing assist</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">Live</p>
              <p className="mt-1 text-sm text-text-secondary">
                Related documents start appearing after you have enough text.
              </p>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <GlassCard>
          <form className="space-y-5" onSubmit={onSubmit}>
            <div>
              <label className="mb-2 block text-sm font-medium text-text-primary">Title</label>
              <input
                className="input w-full text-base"
                placeholder="Name the note so you can spot it later"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-text-primary">Visibility</p>
              <div className="flex flex-wrap gap-2">
                {[
                  {
                    value: false,
                    label: "Private",
                    description: "Only you can see this while it is still forming.",
                  },
                  {
                    value: true,
                    label: "Shared",
                    description: "Teammates can discover it from the notes library.",
                  },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => setIsShared(option.value)}
                    className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                      isShared === option.value
                        ? "border-primary-500/40 bg-primary-500/10 text-primary-700"
                        : "border-black/10 bg-white text-text-secondary hover:bg-black/[0.03] hover:text-text-primary"
                    }`}
                  >
                    <p className="text-sm font-medium">{option.label}</p>
                    <p className="mt-1 text-xs leading-5 opacity-80">{option.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-text-primary">Body</label>
              <div className="rounded-[24px] border border-black/[0.08] bg-white/70 p-4">
                <RichTextEditor
                  onChange={handleEditorChange}
                  placeholder="Write the version of the work that you want to return to tomorrow."
                  className="min-h-[420px]"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-black/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-text-muted">
                {wordCount} words | {readingTime} min read
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/research-notes"
                  className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={saving || !title.trim()}
                  className="rounded-full bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
                >
                  {saving ? "Creating..." : "Create note"}
                </button>
              </div>
            </div>

            {error ? <p className="text-sm text-red-500">{error}</p> : null}
          </form>
        </GlassCard>

        <div className="space-y-4">
          <GlassCard className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Draft signal</p>
              <p className="mt-2 text-sm font-medium text-text-primary">
                {title.trim() ? title.trim() : "Untitled note"}
              </p>
            </div>
            <div className="rounded-2xl border border-black/[0.06] bg-black/[0.03] p-3">
              <p className="text-xs text-text-muted">
                Use notes for structure and traceability. Move finished material into Team Docs when the audience is
                broader than yourself.
              </p>
            </div>
          </GlassCard>

          <KnowledgeAssistPanel query={`${title}\n${editorText}`} topK={7} />
        </div>
      </div>
    </div>
  );
}
