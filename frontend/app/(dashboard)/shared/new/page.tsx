"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GlassCard } from "@/components/shared/GlassCard";
import { RichTextEditor, TiptapContent } from "@/components/shared/RichTextEditor";
import { api } from "@/lib/api";
import {
  buildPaperReviewText,
  buildPaperReviewTitle,
  createPaperReviewDoc,
  EMPTY_DOC_CONTENT,
  PAPER_REVIEW_BODY_TEMPLATE,
  paperReviewDecisionOptions,
  extractTextFromTiptap,
  type PaperReviewDecision,
} from "@/lib/paperReview";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/project";

interface Column {
  id: string;
  name: string;
}

interface ProjectOption {
  id: string;
  name: string;
  role: "owner" | "member";
}

const PERSONAL_SPACE_VALUE = "__personal__";

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function NewSharedEntryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentProjectId, setCurrentProject } = useProjectStore();
  const initialType = searchParams.get("type") === "kanban" ? "kanban" : "article";
  const paperReviewPreset = searchParams.get("preset") === "paper-review";

  const [type, setType] = useState<"article" | "kanban">(paperReviewPreset ? "article" : initialType);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [columns, setColumns] = useState<Column[]>([]);
  const [kanbanColumn, setKanbanColumn] = useState("");
  const [projectLoading, setProjectLoading] = useState(true);
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [targetProjectId, setTargetProjectId] = useState<string>(PERSONAL_SPACE_VALUE);
  const [updateBody, setUpdateBody] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [reviewPaperTitle, setReviewPaperTitle] = useState("");
  const [reviewVenue, setReviewVenue] = useState("");
  const [reviewYear, setReviewYear] = useState("");
  const [reviewLink, setReviewLink] = useState("");
  const [reviewDecision, setReviewDecision] = useState<PaperReviewDecision | "">("");
  const [reviewRating, setReviewRating] = useState("");

  const contentRef = useRef<{ json: TiptapContent | null; text: string }>({ json: EMPTY_DOC_CONTENT, text: "" });
  const initialArticleContent = paperReviewPreset ? PAPER_REVIEW_BODY_TEMPLATE : EMPTY_DOC_CONTENT;

  useEffect(() => {
    let cancelled = false;
    setProjectLoading(true);

    api
      .get<{ data?: Array<Record<string, unknown>> }>("/projects")
      .then((res) => {
        if (cancelled) return;

        const options = (res.data?.data ?? [])
          .map((project) => {
            const role: ProjectOption["role"] = project.role === "owner" ? "owner" : "member";
            return {
              id: typeof project.id === "string" ? project.id : "",
              name: typeof project.name === "string" ? project.name : "",
              role,
            };
          })
          .filter((project) => project.id && project.name);

        setProjectOptions(options);

        if (currentProjectId && options.some((project) => project.id === currentProjectId)) {
          setTargetProjectId(currentProjectId);
          return;
        }

        if (options.length > 0) {
          setTargetProjectId(options[0].id);
          return;
        }

        setTargetProjectId(PERSONAL_SPACE_VALUE);
      })
      .catch(() => {
        if (cancelled) return;
        setProjectOptions([]);
        setTargetProjectId(PERSONAL_SPACE_VALUE);
      })
      .finally(() => {
        if (!cancelled) setProjectLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentProjectId]);

  useEffect(() => {
    if (paperReviewPreset) {
      setType("article");
    }
  }, [paperReviewPreset]);

  useEffect(() => {
    if (type !== "article") return;
    const initialText = extractTextFromTiptap(initialArticleContent);
    contentRef.current = { json: initialArticleContent, text: initialText };
    setWordCount(countWords(initialText));
  }, [initialArticleContent, type]);

  useEffect(() => {
    if (type !== "kanban") return;

    api
      .get("/kanban/columns", {
        params: {
          project_id: targetProjectId !== PERSONAL_SPACE_VALUE ? targetProjectId : undefined,
        },
      })
      .then((res) => {
        const nextColumns = (res.data?.data ?? []) as Column[];
        setColumns(nextColumns);
        if (!kanbanColumn && nextColumns[0]?.name) {
          setKanbanColumn(nextColumns[0].name);
        }
      })
      .catch(() => {
        setColumns([]);
      });
  }, [kanbanColumn, targetProjectId, type]);

  const handleEditorChange = (json: TiptapContent, text: string) => {
    contentRef.current = { json, text };
    setWordCount(countWords(text));
  };

  const readingTime = Math.max(1, Math.ceil(wordCount / 220));
  const destinationLabel = useMemo(
    () => (targetProjectId === PERSONAL_SPACE_VALUE ? "Personal workspace" : "Project team space"),
    [targetProjectId],
  );
  const reviewTitlePreview = buildPaperReviewTitle(reviewPaperTitle);
  const canSubmit = paperReviewPreset ? Boolean(reviewPaperTitle.trim()) : Boolean(title.trim());

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    try {
      const selectedProjectId = targetProjectId !== PERSONAL_SPACE_VALUE ? targetProjectId : null;

      if (type === "article") {
        const bodyJson = contentRef.current.json ?? initialArticleContent;
        const bodyText = contentRef.current.text || extractTextFromTiptap(bodyJson);

        const articleTitle = paperReviewPreset ? buildPaperReviewTitle(reviewPaperTitle) : title.trim();
        const articleContent = paperReviewPreset
          ? {
              text: buildPaperReviewText(
                {
                  paperTitle: reviewPaperTitle,
                  venue: reviewVenue,
                  year: reviewYear,
                  link: reviewLink,
                  decision: reviewDecision,
                  rating: reviewRating,
                },
                bodyText,
              ),
              tiptap: createPaperReviewDoc(
                {
                  paperTitle: reviewPaperTitle,
                  venue: reviewVenue,
                  year: reviewYear,
                  link: reviewLink,
                  decision: reviewDecision,
                  rating: reviewRating,
                },
                bodyJson,
              ),
            }
          : {
              text: bodyText,
              tiptap: bodyJson,
            };

        const articleWordCount = countWords(articleContent.text);
        const res = await api.post(
          "/shared-posts",
          {
            type: "article",
            title: articleTitle,
            content: articleContent,
            word_count: articleWordCount,
            reading_time: Math.max(1, Math.ceil(articleWordCount / 220)),
          },
          {
            params: {
              project_id: selectedProjectId ?? undefined,
            },
          },
        );

        setCurrentProject(selectedProjectId);
        const id = res.data?.data?.id;

        if (id) {
          router.push(`/shared/articles/${id}`);
          return;
        }

        router.push("/shared/articles");
        return;
      }

      const payloadText = updateBody.trim() || title.trim();
      const res = await api.post(
        "/shared-posts",
        {
          type: "kanban",
          title: title.trim(),
          content: { text: payloadText },
          word_count: countWords(payloadText),
          kanban_column: kanbanColumn || null,
        },
        {
          params: {
            project_id: selectedProjectId ?? undefined,
          },
        },
      );

      setCurrentProject(selectedProjectId);
      const id = res.data?.data?.id;

      if (id) {
        router.push(`/shared/feed/${id}`);
        return;
      }

      router.push("/shared/feed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="bg-white/88 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">New entry</p>
            <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-text-primary md:text-[38px]">
              {paperReviewPreset ? "Start a paper review" : type === "article" ? "Write a team doc" : "Post a project update"}
            </h1>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-text-secondary">
              {paperReviewPreset
                ? "Paper reviews now capture the citation context, decision, and review body separately so the team can scan them faster later."
                : type === "article"
                  ? "Use docs for durable thinking, references, decisions, and write-ups that teammates should be able to revisit."
                  : "Use updates for short signals: progress, blockers, decisions-in-flight, or a request for attention."}
            </p>
          </div>

          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-2 lg:grid-cols-1">
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Destination</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{destinationLabel}</p>
              <p className="mt-1 text-sm text-text-secondary">
                Switch the target before publishing if this belongs in a different project.
              </p>
            </div>
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Format</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">
                {paperReviewPreset ? "Paper review" : type === "article" ? "Doc" : "Update"}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {type === "article" ? `${wordCount} words - ${readingTime} min read` : "Short, direct, and easy to scan."}
              </p>
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-text-primary">Destination</label>
            <select
              className="input w-full"
              value={targetProjectId}
              onChange={(event) => setTargetProjectId(event.target.value)}
              disabled={projectLoading}
            >
              <option value={PERSONAL_SPACE_VALUE}>Personal workspace</option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.role})
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-text-muted">
              Personal keeps the entry private. Selecting a project makes it part of that team space.
            </p>
          </div>

          {!paperReviewPreset ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-text-primary">Format</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "article" as const, label: "Doc" },
                  { value: "kanban" as const, label: "Update" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setType(option.value)}
                    className={cn(
                      "rounded-[12px] border px-3.5 py-2 text-sm font-medium transition-colors",
                      type === option.value
                        ? "border-primary-500/40 bg-primary-500/10 text-primary-700"
                        : "border-black/10 bg-white text-text-secondary hover:bg-black/[0.03] hover:text-text-primary",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="workspace-inset px-4 py-4">
              <p className="text-sm font-medium text-text-primary">Structured paper review</p>
              <p className="mt-1 text-sm text-text-secondary">
                The title, venue, decision, and rating are saved as review metadata above the reusable review body.
              </p>
            </div>
          )}

          {type === "kanban" ? (
            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-text-primary">Headline</label>
                <input
                  className="input w-full"
                  placeholder="Summarize the update in one line"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-text-primary">Update body</label>
                <textarea
                  className="input min-h-[140px] w-full resize-none"
                  placeholder="What changed? What should the team know next?"
                  value={updateBody}
                  onChange={(event) => setUpdateBody(event.target.value)}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-text-primary">Topic</label>
                <select
                  className="input w-full"
                  value={kanbanColumn}
                  onChange={(event) => setKanbanColumn(event.target.value)}
                >
                  {columns.length === 0 ? <option value="">No topic yet</option> : null}
                  {columns.map((column) => (
                    <option key={column.id} value={column.name}>
                      {column.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {paperReviewPreset ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-text-primary">Paper title</label>
                    <input
                      className="input w-full"
                      placeholder="Attention Is All You Need"
                      value={reviewPaperTitle}
                      onChange={(event) => setReviewPaperTitle(event.target.value)}
                    />
                    <p className="mt-2 text-xs text-text-muted">Saved as `{reviewTitlePreview}`.</p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-text-primary">Venue</label>
                    <input
                      className="input w-full"
                      placeholder="NeurIPS"
                      value={reviewVenue}
                      onChange={(event) => setReviewVenue(event.target.value)}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-text-primary">Year</label>
                    <input
                      className="input w-full"
                      inputMode="numeric"
                      placeholder="2025"
                      value={reviewYear}
                      onChange={(event) => setReviewYear(event.target.value)}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-text-primary">Decision</label>
                    <select
                      className="input w-full"
                      value={reviewDecision}
                      onChange={(event) => setReviewDecision(event.target.value as PaperReviewDecision | "")}
                    >
                      <option value="">Not set</option>
                      {paperReviewDecisionOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-text-primary">Rating</label>
                    <input
                      className="input w-full"
                      placeholder="4/5"
                      value={reviewRating}
                      onChange={(event) => setReviewRating(event.target.value)}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-text-primary">Source link</label>
                    <input
                      className="input w-full"
                      type="url"
                      placeholder="https://arxiv.org/abs/..."
                      value={reviewLink}
                      onChange={(event) => setReviewLink(event.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-primary">Title</label>
                  <input
                    className="input w-full"
                    placeholder="Name the document clearly"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </div>
              )}

              <div className="workspace-inset px-4 py-4">
                <p className="text-sm font-medium text-text-primary">
                  {paperReviewPreset ? "Review body" : "Document body"}
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  {paperReviewPreset
                    ? "Write the review in durable language. The metadata above is for fast scanning; the body should hold the judgment."
                    : "Write the version of the work that someone else can use later."}
                </p>
              </div>

              <div>
                <div className="rounded-[24px] border border-black/[0.08] bg-white/70 p-4">
                  <RichTextEditor
                    initialContent={initialArticleContent}
                    onChange={handleEditorChange}
                    placeholder={
                      paperReviewPreset
                        ? "Capture what the paper claims, how strong the evidence is, and what the team should do next."
                        : "Write the version of the work that someone else can use later."
                    }
                    className="min-h-[320px]"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-black/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-text-muted">
              {type === "article"
                ? `${wordCount} words - ${readingTime} min read`
                : `${countWords(updateBody || title)} words in this update`}
            </p>
            <button
              type="submit"
              disabled={saving || !canSubmit}
              className="rounded-[12px] bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
            >
              {saving ? "Saving..." : paperReviewPreset ? "Create review" : type === "article" ? "Create doc" : "Post update"}
            </button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}

export default function NewSharedEntryPage() {
  return (
    <Suspense>
      <NewSharedEntryContent />
    </Suspense>
  );
}
