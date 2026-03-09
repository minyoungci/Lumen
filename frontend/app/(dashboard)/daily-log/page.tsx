"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GlassCard } from "@/components/shared/GlassCard";
import { RichTextEditor, TiptapContent, textToTiptap } from "@/components/shared/RichTextEditor";
import { EditorSkeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { tiptapToReadableText } from "@/lib/tiptapReadable";
import { useProjectStore } from "@/store/project";

function formatDateISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDate(iso: string, days: number): string {
  const next = new Date(`${iso}T00:00:00`);
  next.setDate(next.getDate() + days);
  return formatDateISO(next);
}

type SaveStatus = "idle" | "saving" | "saved" | "error";
type AutosaveInterval = "30" | "60" | "off";
type TemplatePreset = "summary" | "experiment" | "meeting";

interface Toast {
  message: string;
  type: "success" | "error";
  href?: string;
}

interface ProjectOption {
  id: string;
  name: string;
  role: "owner" | "member";
}

interface MePreferenceRow {
  preferences?: {
    autosave_interval?: AutosaveInterval;
  };
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function buildListItem(text: string): TiptapContent {
  return {
    type: "listItem",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

function buildSummaryTemplate(dateLabel: string): TiptapContent {
  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: `${dateLabel} summary` }],
      },
      {
        type: "bulletList",
        content: [
          buildListItem("Most important result today"),
          buildListItem("What changed in the work"),
          buildListItem("What still feels unresolved"),
        ],
      },
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Work completed" }],
      },
      {
        type: "orderedList",
        attrs: { start: 1 },
        content: [
          buildListItem("Task"),
          buildListItem("Result"),
          buildListItem("Link or file worth revisiting"),
        ],
      },
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Next actions" }],
      },
      {
        type: "orderedList",
        attrs: { start: 1 },
        content: [
          buildListItem("Priority 1"),
          buildListItem("Priority 2"),
          buildListItem("Priority 3"),
        ],
      },
    ],
  };
}

function buildExperimentTemplate(dateLabel: string): TiptapContent {
  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: `${dateLabel} experiment log` }],
      },
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Goal" }],
      },
      {
        type: "bulletList",
        content: [
          buildListItem("Hypothesis"),
          buildListItem("Signal of success"),
        ],
      },
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Method" }],
      },
      {
        type: "orderedList",
        attrs: { start: 1 },
        content: [
          buildListItem("Step 1"),
          buildListItem("Step 2"),
          buildListItem("Step 3"),
        ],
      },
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Result and readout" }],
      },
      {
        type: "bulletList",
        content: [
          buildListItem("Observed outcome"),
          buildListItem("Interpretation"),
          buildListItem("Next experiment"),
        ],
      },
    ],
  };
}

function buildMeetingTemplate(dateLabel: string): TiptapContent {
  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: `${dateLabel} meeting notes` }],
      },
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Decisions" }],
      },
      {
        type: "bulletList",
        content: [
          buildListItem("Decision 1"),
          buildListItem("Decision 2"),
        ],
      },
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Action items" }],
      },
      {
        type: "orderedList",
        attrs: { start: 1 },
        content: [
          buildListItem("Owner · deadline · action"),
          buildListItem("Owner · deadline · action"),
        ],
      },
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Follow-up" }],
      },
      {
        type: "bulletList",
        content: [
          buildListItem("What needs confirmation"),
          buildListItem("What should happen before the next meeting"),
        ],
      },
    ],
  };
}

export default function DailyLogPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentProjectId, projects, setCurrentProject } = useProjectStore();

  const [selectedDate, setSelectedDate] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [initialContent, setInitialContent] = useState<TiptapContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [isDirty, setIsDirty] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [title, setTitle] = useState("");
  const [currentLogId, setCurrentLogId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [lastEditedAt, setLastEditedAt] = useState<number>(Date.now());
  const [autosaveInterval, setAutosaveInterval] = useState<AutosaveInterval>("30");
  const [templatePreset, setTemplatePreset] = useState<TemplatePreset>("summary");
  const [shareProjectModalOpen, setShareProjectModalOpen] = useState(false);
  const [shareProjectLoading, setShareProjectLoading] = useState(false);
  const [shareProjects, setShareProjects] = useState<ProjectOption[]>([]);
  const [selectedShareProjectId, setSelectedShareProjectId] = useState("");

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<{ json: TiptapContent | null; text: string }>({ json: null, text: "" });
  const titleRef = useRef("");

  const projectName = projects.find((project) => project.id === currentProjectId)?.name ?? null;

  const showToast = useCallback((message: string, type: "success" | "error", href?: string) => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    setToast({ message, type, href });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const queryDate = searchParams.get("date");
    if (queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate)) {
      setSelectedDate(queryDate);
      return;
    }
    setSelectedDate(formatDateISO(new Date()));
  }, [searchParams]);

  useEffect(() => {
    let mounted = true;

    const loadPreferences = async () => {
      try {
        const res = await api.get("/users/me");
        const row = res.data?.data as MePreferenceRow | undefined;
        const interval = row?.preferences?.autosave_interval;
        if (!mounted) return;
        if (interval === "30" || interval === "60" || interval === "off") {
          setAutosaveInterval(interval);
        }
      } catch {
        // keep default autosave
      }
    };

    void loadPreferences();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  useEffect(() => {
    if (!selectedDate) return;
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setIsDirty(false);

      try {
        const res = await api.get(`/daily-logs/${selectedDate}`, {
          params: { project_id: currentProjectId ?? undefined },
        });
        const data = res.data?.data;
        const raw = data?.content;
        const tiptap: TiptapContent =
          raw?.tiptap ?? textToTiptap(typeof raw?.text === "string" ? raw.text : "");
        const fallbackText = typeof raw?.text === "string" ? raw.text : "";
        const text = tiptapToReadableText(tiptap) || fallbackText;

        if (!mounted) return;

        latestRef.current = { json: tiptap, text };
        setInitialContent(tiptap);
        setEditorKey((key) => key + 1);
        setWordCount(countWords(text));
        setTitle(raw?.title ?? "");
        setCurrentLogId(typeof data?.id === "string" ? data.id : null);
        setLastSavedAt(typeof data?.updated_at === "string" ? data.updated_at : null);
        setSaveStatus("idle");
        setIsDirty(false);
      } catch {
        if (!mounted) return;

        const empty = textToTiptap("");
        latestRef.current = { json: empty, text: "" };
        setInitialContent(empty);
        setEditorKey((key) => key + 1);
        setWordCount(0);
        setTitle("");
        setCurrentLogId(null);
        setLastSavedAt(null);
        setSaveStatus("idle");
        setIsDirty(false);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [currentProjectId, selectedDate]);

  const handleChange = useCallback((json: TiptapContent, text: string) => {
    const readableText = tiptapToReadableText(json) || text;
    latestRef.current = { json, text: readableText };
    setWordCount(countWords(readableText));
    setIsDirty(true);
    setLastEditedAt(Date.now());
  }, []);

  const handleDraftSave = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!selectedDate || saveStatus === "saving") return;

      const { json, text } = latestRef.current;
      const nextWordCount = countWords(text);
      setSaveStatus("saving");

      try {
        const res = await api.put(
          `/daily-logs/${selectedDate}`,
          {
            content: { text, tiptap: json, title: titleRef.current },
            word_count: nextWordCount,
            status: "draft",
          },
          { params: { project_id: currentProjectId ?? undefined } }
        );

        const updatedAt = res.data?.data?.updated_at;
        const logId = res.data?.data?.id;

        if (typeof logId === "string") setCurrentLogId(logId);
        if (typeof updatedAt === "string") setLastSavedAt(updatedAt);

        setSaveStatus("saved");
        setIsDirty(false);
        if (!silent) showToast("Draft saved.", "success");
      } catch {
        setSaveStatus("error");
        if (!silent) showToast("Could not save the draft. Please try again.", "error");
      }
    },
    [currentProjectId, saveStatus, selectedDate, showToast]
  );

  useEffect(() => {
    if (autosaveInterval === "off") return;
    if (loading || !selectedDate || !isDirty || saveStatus === "saving") return;

    const delay = Number(autosaveInterval) * 1000;
    const timer = window.setTimeout(() => {
      void handleDraftSave({ silent: true });
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [autosaveInterval, handleDraftSave, isDirty, lastEditedAt, loading, saveStatus, selectedDate]);

  const fetchShareProjects = useCallback(async (): Promise<ProjectOption[]> => {
    const res = await api.get<{ data?: Array<Record<string, unknown>> }>("/projects");
    const raw = Array.isArray(res.data?.data) ? res.data.data : [];
    return raw
      .map((project) => {
        const role: ProjectOption["role"] = project.role === "owner" ? "owner" : "member";
        return {
          id: typeof project.id === "string" ? project.id : "",
          name: typeof project.name === "string" ? project.name : "",
          role,
        };
      })
      .filter((project) => project.id && project.name);
  }, []);

  const shareToProjectIfNeeded = useCallback(
    async (
      projectId: string,
      entryTitle: string,
      text: string,
      json: TiptapContent | null,
      nextWordCount: number
    ) => {
      const existing = await api.get("/shared-posts", {
        params: {
          mine: true,
          type: "article",
          limit: 100,
          project_id: projectId,
        },
      });

      const alreadyShared = (existing.data?.data ?? []).some(
        (post: { title?: string }) => post.title === entryTitle
      );

      if (alreadyShared) return;

      await api.post(
        "/shared-posts",
        {
          type: "article",
          title: entryTitle,
          content: { text, tiptap: json },
          word_count: nextWordCount,
          visibility: "shared",
        },
        { params: { project_id: projectId } }
      );
    },
    []
  );

  const saveLog = useCallback(
    async (status: "private" | "shared", shareProjectId?: string) => {
      const { json, text } = latestRef.current;
      const nextWordCount = countWords(text);
      const entryTitle = titleRef.current.trim() || `${selectedDate} journal entry`;

      setSaveStatus("saving");

      try {
        const res = await api.put(
          `/daily-logs/${selectedDate}`,
          {
            content: { text, tiptap: json, title: titleRef.current },
            word_count: nextWordCount,
            status,
          },
          { params: { project_id: currentProjectId ?? undefined } }
        );

        const updatedAt = res.data?.data?.updated_at;
        const logId = res.data?.data?.id;

        if (typeof logId === "string") setCurrentLogId(logId);
        if (typeof updatedAt === "string") setLastSavedAt(updatedAt);

        if (status === "shared") {
          const targetProjectId = shareProjectId ?? currentProjectId;
          if (!targetProjectId) {
            throw new Error("Team project id is required for shared save");
          }

          await shareToProjectIfNeeded(targetProjectId, entryTitle, text, json, nextWordCount);

          if (!currentProjectId) {
            setCurrentProject(targetProjectId);
          }

          setSaveStatus("saved");
          setIsDirty(false);
          showToast("Shared to team docs.", "success", "/shared/articles");
          return;
        }

        setSaveStatus("saved");
        setIsDirty(false);
        showToast("Saved privately.", "success");
      } catch {
        setSaveStatus("error");
        showToast("Save failed. Please try again.", "error");
      }
    },
    [currentProjectId, selectedDate, setCurrentProject, shareToProjectIfNeeded, showToast]
  );

  const handleSave = useCallback(
    async (status: "private" | "shared") => {
      if (status === "shared" && !currentProjectId) {
        setShareProjectLoading(true);
        try {
          const projects = await fetchShareProjects();
          if (projects.length === 0) {
            showToast("Join or create a project before sharing with the team.", "error", "/projects");
            return;
          }

          setShareProjects(projects);
          setSelectedShareProjectId(projects[0].id);
          setShareProjectModalOpen(true);
        } catch {
          showToast("Could not load projects. Please try again.", "error");
        } finally {
          setShareProjectLoading(false);
        }
        return;
      }

      await saveLog(status);
    },
    [currentProjectId, fetchShareProjects, saveLog, showToast]
  );

  const handleConfirmShareToProject = useCallback(async () => {
    if (!selectedShareProjectId) {
      showToast("Choose a project before sharing.", "error");
      return;
    }

    setShareProjectModalOpen(false);
    await saveLog("shared", selectedShareProjectId);
  }, [saveLog, selectedShareProjectId, showToast]);

  const handleDeleteCurrentLog = useCallback(async () => {
    if (!currentLogId) {
      showToast("There is no saved entry to delete.", "error");
      return;
    }

    if (!window.confirm("Delete this journal entry? This cannot be undone.")) return;

    try {
      await api.delete(`/daily-logs/${currentLogId}`);
      const empty = textToTiptap("");
      latestRef.current = { json: empty, text: "" };
      setInitialContent(empty);
      setEditorKey((key) => key + 1);
      setWordCount(0);
      setTitle("");
      setCurrentLogId(null);
      setLastSavedAt(null);
      setSaveStatus("idle");
      setIsDirty(false);
      showToast("Journal entry deleted.", "success");
    } catch {
      showToast("Delete failed. Please try again.", "error");
    }
  }, [currentLogId, showToast]);

  const applyRecommendedTemplate = useCallback(() => {
    const hasExistingContent = Boolean(titleRef.current.trim()) || Boolean(latestRef.current.text.trim());
    if (hasExistingContent) {
      const confirmed = window.confirm("Replace the current draft with the selected template?");
      if (!confirmed) return;
    }

    const dateLabel = selectedDate || formatDateISO(new Date());
    const template =
      templatePreset === "experiment"
        ? buildExperimentTemplate(dateLabel)
        : templatePreset === "meeting"
          ? buildMeetingTemplate(dateLabel)
          : buildSummaryTemplate(dateLabel);
    const templateText = tiptapToReadableText(template);

    latestRef.current = { json: template, text: templateText };
    setInitialContent(template);
    setEditorKey((key) => key + 1);
    setWordCount(countWords(templateText));

    if (!titleRef.current.trim()) {
      setTitle(`${dateLabel} journal`);
    }

    setSaveStatus("idle");
    setIsDirty(true);
    setLastEditedAt(Date.now());

    const templateLabel =
      templatePreset === "experiment" ? "Experiment" : templatePreset === "meeting" ? "Meeting" : "Summary";
    showToast(`${templateLabel} template applied.`, "success");
  }, [selectedDate, showToast, templatePreset]);

  const savedAtLabel = lastSavedAt
    ? new Date(lastSavedAt).toLocaleString("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const autosaveLabel =
    autosaveInterval === "off" ? "Autosave off" : `Autosave every ${autosaveInterval}s`;

  const statusBadge =
    isDirty ? (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/60 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
        Unsaved changes
      </span>
    ) : saveStatus === "saving" ? (
      <span className="text-xs text-text-muted">Saving...</span>
    ) : saveStatus === "saved" ? (
      <span className="text-xs text-green-600">Saved</span>
    ) : saveStatus === "error" ? (
      <span className="text-xs text-red-500">Save failed</span>
    ) : null;

  return (
    <div className="space-y-5">
      {toast ? (
        <div
          onClick={() => {
            if (toast.href) {
              setToast(null);
              router.push(toast.href);
            }
          }}
          className={`fixed right-6 top-6 z-50 flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-md transition-all duration-300 ${
            toast.type === "success"
              ? "border border-green-200/70 bg-white/95 text-green-700 shadow-green-100"
              : "border border-red-200/70 bg-white/95 text-red-600 shadow-red-100"
          } ${toast.href ? "cursor-pointer hover:shadow-xl" : ""}`}
        >
          <span>{toast.type === "success" ? "Saved" : "Issue"}</span>
          <span>{toast.message}</span>
          {toast.href ? <span className="ml-1 text-xs opacity-60">Open</span> : null}
        </div>
      ) : null}

      {shareProjectModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/35 backdrop-blur-[1px]"
            onClick={() => setShareProjectModalOpen(false)}
            aria-label="Close modal"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-text-primary">Choose a team project</h2>
            <p className="mt-1 text-sm text-text-muted">
              This journal entry is in Personal workspace right now. Pick a project to publish a shared doc for the team.
            </p>

            <div className="mt-4 space-y-2">
              <label className="text-xs font-medium text-text-muted">Project</label>
              <select
                value={selectedShareProjectId}
                onChange={(event) => setSelectedShareProjectId(event.target.value)}
                className="input w-full"
              >
                {shareProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name} ({project.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShareProjectModalOpen(false)}
                className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-text-secondary hover:bg-black/[0.03]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmShareToProject()}
                disabled={saveStatus === "saving"}
                className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-60"
              >
                {saveStatus === "saving" ? "Sharing..." : "Share to project"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="bg-white/88 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Journal</p>
            <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-text-primary md:text-[38px]">
              Capture the day before the context disappears.
            </h1>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-text-secondary">
              Start with a short summary, then record what changed, what you learned, and what should happen next.
            </p>
          </div>

          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-2 lg:grid-cols-1">
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Scope</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">
                {projectName ?? "Personal"}
              </p>
              <p className="mt-1 text-sm text-text-secondary">Journal entries stay attached to the active workspace context.</p>
            </div>
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Autosave</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{autosaveLabel}</p>
              <p className="mt-1 text-sm text-text-secondary">Draft saves happen automatically while you are actively editing.</p>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="flex flex-col gap-3 pb-1 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { value: "summary" as const, label: "Summary" },
            { value: "experiment" as const, label: "Experiment" },
            { value: "meeting" as const, label: "Meeting" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTemplatePreset(option.value)}
              className={`rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
                templatePreset === option.value
                  ? "border-primary-500/40 bg-primary-500/10 text-primary-700"
                  : "border-black/10 bg-white text-text-secondary hover:bg-black/[0.03] hover:text-text-primary"
              }`}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            onClick={applyRecommendedTemplate}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
          >
            Insert template
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-black/[0.03] hover:text-text-primary"
            onClick={() => setSelectedDate((value) => shiftDate(value, -1))}
          >
            Prev
          </button>
          <input
            type="date"
            className="input"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
          <button
            type="button"
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-black/[0.03] hover:text-text-primary"
            onClick={() => setSelectedDate(formatDateISO(new Date()))}
          >
            Today
          </button>
          <button
            type="button"
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-black/[0.03] hover:text-text-primary"
            onClick={() => setSelectedDate((value) => shiftDate(value, 1))}
          >
            Next
          </button>
        </div>
      </div>

      <GlassCard className="min-h-[560px]">
        <input
          type="text"
          placeholder="Entry title (optional)"
          className="mb-4 w-full border-0 border-b border-black/[0.06] bg-transparent pb-3 text-3xl font-bold text-text-primary outline-none placeholder:text-text-muted/40"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setIsDirty(true);
            setLastEditedAt(Date.now());
          }}
        />

        <div className="mb-4 rounded-xl border border-black/[0.08] bg-white/70 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Writing guide</p>
          <p className="mt-1 text-sm text-text-secondary">
            Record the signal first: what changed, what you learned, what is blocked, and what should happen next.
          </p>
        </div>

        {loading ? (
          <EditorSkeleton />
        ) : (
          <div className="medium-prose">
            <RichTextEditor
              key={editorKey}
              initialContent={initialContent}
              onChange={handleChange}
              placeholder="Write the working notes behind today's progress."
              className="min-h-[400px]"
            />
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3 border-t border-black/[0.06] pt-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-text-muted">{wordCount} words</span>
            <span className="text-xs text-text-muted">{autosaveLabel}</span>
            {statusBadge}
            {savedAtLabel ? <span className="text-xs text-text-muted">Last saved {savedAtLabel}</span> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleDraftSave()}
              disabled={saveStatus === "saving"}
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-black/[0.03] hover:text-text-primary disabled:opacity-50"
            >
              Save draft
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteCurrentLog()}
              disabled={!currentLogId || saveStatus === "saving"}
              className="rounded-lg border border-red-200/70 bg-red-50 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-100 disabled:opacity-40"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => void handleSave("private")}
              disabled={saveStatus === "saving"}
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03] disabled:opacity-50"
            >
              Save private
            </button>
            <button
              type="button"
              onClick={() => void handleSave("shared")}
              disabled={saveStatus === "saving" || shareProjectLoading}
              className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
            >
              {shareProjectLoading ? "Loading..." : "Share to team"}
            </button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
