"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/shared/GlassCard";
import { RichTextEditor, TiptapContent, textToTiptap } from "@/components/shared/RichTextEditor";
import { EditorSkeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";

function formatDateISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function shiftDate(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return formatDateISO(d);
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface Toast {
  message: string;
  type: "success" | "error";
  href?: string;
}

export default function DailyLogPage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(formatDateISO(new Date()));
  const [editorKey, setEditorKey] = useState(0);
  const [initialContent, setInitialContent] = useState<TiptapContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [isDirty, setIsDirty] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [title, setTitle] = useState("");
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Holds latest editor state without re-rendering
  const latestRef = useRef<{ json: TiptapContent | null; text: string }>({ json: null, text: "" });
  const titleRef = useRef("");
  const saveMenuRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string, type: "success" | "error", href?: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type, href });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  // Sync title to ref
  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  // Close save menu on outside click
  useEffect(() => {
    if (!showSaveMenu) return;
    const handler = (e: MouseEvent) => {
      if (saveMenuRef.current && !saveMenuRef.current.contains(e.target as Node)) {
        setShowSaveMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSaveMenu]);

  // Load content when date changes
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setIsDirty(false);
    setShowSaveMenu(false);

    const load = async () => {
      try {
        const res = await api.get(`/daily-logs/${selectedDate}`);
        const data = res.data?.data;
        const raw = data?.content;
        const tiptap: TiptapContent =
          raw?.tiptap ?? textToTiptap(typeof raw?.text === "string" ? raw.text : "");
        const text = typeof raw?.text === "string" ? raw.text : "";

        if (mounted) {
          latestRef.current = { json: tiptap, text };
          setInitialContent(tiptap);
          setEditorKey((k) => k + 1);
          setWordCount(text.trim().split(/\s+/).filter(Boolean).length);
          setTitle(raw?.title ?? "");
          setSaveStatus("idle");
          setIsDirty(false);
        }
      } catch {
        if (mounted) {
          const empty = textToTiptap("");
          latestRef.current = { json: empty, text: "" };
          setInitialContent(empty);
          setEditorKey((k) => k + 1);
          setWordCount(0);
          setTitle("");
          setSaveStatus("idle");
          setIsDirty(false);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [selectedDate]);

  const handleChange = useCallback((json: TiptapContent, text: string) => {
    latestRef.current = { json, text };
    setWordCount(text.trim().split(/\s+/).filter(Boolean).length);
    setIsDirty(true);
  }, []);

  // 임시저장
  const handleDraftSave = async () => {
    const { json, text } = latestRef.current;
    const wc = text.trim().split(/\s+/).filter(Boolean).length;
    setSaveStatus("saving");
    try {
      await api.put(`/daily-logs/${selectedDate}`, {
        content: { text, tiptap: json, title: titleRef.current },
        word_count: wc,
        status: "draft",
      });
      setSaveStatus("saved");
      setIsDirty(false);
      showToast("임시저장 완료", "success");
    } catch {
      setSaveStatus("error");
      showToast("저장 실패. 다시 시도해주세요.", "error");
    }
  };

  // 개인보관 or 팀공유
  const handleSave = async (status: "private" | "shared") => {
    const { json, text } = latestRef.current;
    const wc = text.trim().split(/\s+/).filter(Boolean).length;
    const currentTitle = titleRef.current || `${selectedDate} 로그`;
    setShowSaveMenu(false);
    setSaveStatus("saving");
    try {
      await api.put(`/daily-logs/${selectedDate}`, {
        content: { text, tiptap: json, title: titleRef.current },
        word_count: wc,
        status,
      });

      if (status === "shared") {
        // 중복 공유 방지: 같은 제목의 shared post가 이미 있으면 생성 안 함
        const existing = await api.get("/shared-posts", {
          params: { mine: true, type: "article", limit: 100 },
        });
        const alreadyShared = (existing.data?.data ?? []).some(
          (p: { title: string }) => p.title === currentTitle,
        );

        if (!alreadyShared) {
          await api.post("/shared-posts", {
            type: "article",
            title: currentTitle,
            content: { text, tiptap: json },
            word_count: wc,
            visibility: "shared",
          });
        }

        setSaveStatus("saved");
        setIsDirty(false);
        showToast("팀 공유 완료 — 팀원은 Shared Articles에서 확인 가능", "success", "/shared/articles");
      } else {
        setSaveStatus("saved");
        setIsDirty(false);
        showToast("개인 보관으로 저장되었습니다", "success");
      }
    } catch {
      setSaveStatus("error");
      showToast("저장 실패. 다시 시도해주세요.", "error");
    }
  };

  const statusBadge =
    isDirty ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600 border border-amber-200/60">
        ● 저장되지 않은 변경사항
      </span>
    ) : saveStatus === "saving" ? (
      <span className="text-xs text-text-muted">저장 중...</span>
    ) : saveStatus === "saved" ? (
      <span className="text-xs text-green-600">저장됨 ✓</span>
    ) : saveStatus === "error" ? (
      <span className="text-xs text-red-500">저장 실패 ✗</span>
    ) : null;

  return (
    <div className="space-y-5">
      {/* ── Toast ── */}
      {toast && (
        <div
          onClick={() => {
            if (toast.href) {
              setToast(null);
              router.push(toast.href);
            }
          }}
          className={`fixed right-6 top-6 z-50 flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-md transition-all duration-300 ${
            toast.type === "success"
              ? "bg-white/95 text-green-700 border border-green-200/70 shadow-green-100"
              : "bg-white/95 text-red-600 border border-red-200/70 shadow-red-100"
          } ${toast.href ? "cursor-pointer hover:shadow-xl" : ""}`}
        >
          <span>{toast.type === "success" ? "✓" : "✕"}</span>
          {toast.message}
          {toast.href && (
            <span className="ml-1 text-xs opacity-60">→</span>
          )}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between pb-4">
        <div>
          <h1 className="mb-1 text-2xl font-semibold text-text-primary">Daily Log</h1>
          <p className="text-sm text-text-muted">오늘의 연구 로그를 기록하세요.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg border border-black/10 bg-white/80 px-3 py-2 text-sm text-text-secondary hover:bg-white hover:text-text-primary transition-colors"
            onClick={() => setSelectedDate((d) => shiftDate(d, -1))}
          >
            ← Prev
          </button>
          <input
            type="date"
            className="input"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          <button
            className="rounded-lg border border-black/10 bg-white/80 px-3 py-2 text-sm text-text-secondary hover:bg-white hover:text-text-primary transition-colors"
            onClick={() => setSelectedDate((d) => shiftDate(d, 1))}
          >
            Next →
          </button>
        </div>
      </div>

      <GlassCard className="min-h-[560px]">
        {/* Title input */}
        <input
          type="text"
          placeholder="제목 (선택)"
          className="w-full border-0 bg-transparent text-3xl font-bold text-text-primary outline-none placeholder:text-text-muted/40 mb-4 pb-3 border-b border-black/[0.06]"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setIsDirty(true);
          }}
        />

        {loading ? (
          <EditorSkeleton />
        ) : (
          <div className="medium-prose">
            <RichTextEditor
              key={editorKey}
              initialContent={initialContent}
              onChange={handleChange}
              placeholder="오늘 작업한 내용을 자유롭게 기록하세요."
              className="min-h-[400px]"
            />
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between border-t border-black/[0.06] pt-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-muted">{wordCount} words</span>
            {statusBadge}
          </div>
          <div className="flex items-center gap-2">
            {/* 임시저장 */}
            <button
              onClick={() => void handleDraftSave()}
              disabled={saveStatus === "saving"}
              className="rounded-lg border border-black/10 bg-white/80 px-3 py-2 text-sm text-text-secondary hover:bg-white hover:text-text-primary transition-colors disabled:opacity-50"
            >
              임시저장
            </button>

            {/* 저장 드롭다운 */}
            <div className="relative" ref={saveMenuRef}>
              <button
                onClick={() => setShowSaveMenu((s) => !s)}
                disabled={saveStatus === "saving"}
                className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
              >
                저장 ▾
              </button>

              {showSaveMenu && (
                <div className="save-dropdown">
                  <button
                    onClick={() => void handleSave("private")}
                    className="w-full px-4 py-3 text-left text-sm text-text-primary hover:bg-black/[0.03] transition-colors"
                  >
                    🔒 개인 보관
                  </button>
                  <button
                    onClick={() => void handleSave("shared")}
                    className="w-full px-4 py-3 text-left text-sm font-medium text-primary-500 hover:bg-black/[0.03] transition-colors"
                  >
                    🌐 팀 공유
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
