"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface SearchResultItem {
  id: string;
  content_type: string;
  title: string;
  preview?: string;
  subtype?: string | null;
  log_date?: string | null;
  slug?: string | null;
  author?: {
    display_name?: string | null;
  } | null;
  updated_at?: string;
  relevance_score?: number | null;
  match_reason?: string | null;
  evidence_snippet?: string | null;
}

function resolveResultPath(item: SearchResultItem): string {
  if (item.content_type === "research_note") {
    return `/research-notes/${item.id}`;
  }
  if (item.content_type === "shared_post") {
    return item.subtype === "kanban" || item.subtype === "insight"
      ? `/shared/feed/${item.id}`
      : `/shared/articles/${item.id}`;
  }
  if (item.content_type === "daily_log") {
    return item.log_date ? `/daily-log/${item.log_date}` : "/daily-log/archive";
  }
  if (item.content_type === "tag") {
    return item.slug ? `/graph?tag=${encodeURIComponent(item.slug)}` : "/graph";
  }
  return "/home";
}

function labelForType(contentType: string, subtype?: string | null): string {
  if (contentType === "research_note") return "Note";
  if (contentType === "shared_post") return subtype === "kanban" || subtype === "insight" ? "Update" : "Doc";
  if (contentType === "daily_log") return "Journal";
  if (contentType === "tag") return "Tag";
  return "Result";
}

function formatWhen(value?: string): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

interface GlobalSearchProps {
  className?: string;
}

export function GlobalSearch({ className }: GlobalSearchProps) {
  const router = useRouter();

  const modalInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const trimmed = query.trim();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        return;
      }

      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => modalInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setResults([]);
      setLoading(false);
      setError(null);
      setActiveIndex(0);
      return;
    }

    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setError(null);
      setActiveIndex(0);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.get<{ data?: SearchResultItem[] }>("/search", {
          params: { q: trimmed, limit: 12, mode: "hybrid" },
        });
        if (cancelled) return;
        setResults(response.data?.data ?? []);
        setActiveIndex(0);
      } catch {
        if (cancelled) return;
        setResults([]);
        setError("Search results could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, trimmed]);

  const hasResults = results.length > 0;
  const activeItem = useMemo(() => {
    if (!hasResults) return null;
    return results[Math.min(activeIndex, results.length - 1)] ?? null;
  }, [activeIndex, hasResults, results]);

  const handleMove = (direction: "next" | "prev") => {
    if (!hasResults) return;

    setActiveIndex((previous) => {
      if (direction === "next") return (previous + 1) % results.length;
      return (previous - 1 + results.length) % results.length;
    });
  };

  const openResult = (item: SearchResultItem) => {
    setOpen(false);
    router.push(resolveResultPath(item));
  };

  return (
    <>
      <div className={className}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-10 w-full items-center gap-3 rounded-[12px] border border-black/[0.08] bg-white/84 px-3 text-left text-sm text-text-secondary transition-colors hover:bg-white hover:text-text-primary"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M14.17 13.12 17.5 16.46M15.84 9.27a6.57 6.57 0 1 1-13.14 0 6.57 6.57 0 0 1 13.14 0Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="min-w-0 flex-1 truncate">{trimmed || "Search notes, docs, updates"}</span>
          <span className="rounded-[10px] border border-black/10 bg-white px-2 py-0.5 text-[11px] font-medium text-text-muted">
            Ctrl K
          </span>
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            aria-label="Close search"
            className="absolute inset-0 bg-black/35"
            onClick={() => setOpen(false)}
          />

          <div className="relative mx-auto mt-12 w-[min(860px,calc(100%-24px))] overflow-hidden rounded-[20px] border border-black/[0.08] bg-white shadow-[0_24px_64px_rgba(15,23,42,0.14)]">
            <div className="border-b border-black/[0.06] px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Workspace search</p>
              <div className="mt-3 flex items-center gap-3 rounded-[14px] border border-black/[0.08] bg-black/[0.02] px-3">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="text-text-muted">
                  <path
                    d="M14.17 13.12 17.5 16.46M15.84 9.27a6.57 6.57 0 1 1-13.14 0 6.57 6.57 0 0 1 13.14 0Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <input
                  ref={modalInputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      handleMove("next");
                      return;
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      handleMove("prev");
                      return;
                    }
                    if (event.key === "Enter" && activeItem) {
                      event.preventDefault();
                      openResult(activeItem);
                    }
                  }}
                  placeholder="Search notes, docs, updates, journal, or tags"
                  className="h-12 w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                />
              </div>
              <p className="mt-2 text-xs text-text-muted">
                Use arrow keys to move, Enter to open, and Escape to close.
              </p>
            </div>

            <div className="max-h-[68vh] overflow-y-auto p-3">
              {!trimmed ? (
                <div className="workspace-inset px-4 py-10 text-center">
                  <p className="text-sm font-medium text-text-primary">Search across the active workspace.</p>
                  <p className="mt-2 text-sm text-text-secondary">
                    Find draft notes, team docs, updates, journal entries, and graph tags from one place.
                  </p>
                </div>
              ) : null}

              {trimmed && loading ? (
                <div className="workspace-inset px-4 py-10 text-center text-sm text-text-muted">
                  Searching...
                </div>
              ) : null}

              {trimmed && !loading && error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-10 text-center text-sm text-red-600">
                  {error}
                </div>
              ) : null}

              {trimmed && !loading && !error && !hasResults ? (
                <div className="workspace-inset px-4 py-10 text-center">
                  <p className="text-sm font-medium text-text-primary">No results for this search.</p>
                  <p className="mt-2 text-sm text-text-secondary">
                    Try a shorter phrase, a project name, or a document title.
                  </p>
                </div>
              ) : null}

              {hasResults ? (
                <div className="space-y-1">
                  {results.map((item, index) => {
                    const active = index === activeIndex;

                    return (
                      <button
                        key={`${item.content_type}-${item.id}`}
                        type="button"
                        onMouseEnter={() => setActiveIndex(index)}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          openResult(item);
                        }}
                        className={`w-full rounded-[14px] border px-4 py-3 text-left transition-colors ${
                          active
                            ? "border-primary-300 bg-primary-500/10"
                            : "border-transparent hover:border-black/10 hover:bg-black/[0.03]"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-[10px] border border-black/10 bg-white px-2 py-0.5 text-[10px] font-medium text-text-muted">
                            {labelForType(item.content_type, item.subtype)}
                          </span>
                          {typeof item.relevance_score === "number" ? (
                            <span className="rounded-[10px] border border-primary-200 bg-primary-50 px-2 py-0.5 text-[10px] font-medium text-primary-700">
                              {Math.round(item.relevance_score * 100)}%
                            </span>
                          ) : null}
                          {item.author?.display_name ? (
                            <span className="text-[11px] text-text-muted">{item.author.display_name}</span>
                          ) : null}
                          {item.updated_at ? (
                            <span className="ml-auto text-[11px] text-text-muted">{formatWhen(item.updated_at)}</span>
                          ) : null}
                        </div>
                        <p className="mt-2 truncate text-sm font-medium text-text-primary">{item.title || "Untitled"}</p>
                        {item.preview ? (
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-secondary">{item.preview}</p>
                        ) : null}
                        {item.match_reason && item.evidence_snippet ? (
                          <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-text-muted">
                            {item.match_reason}: {item.evidence_snippet}
                          </p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
