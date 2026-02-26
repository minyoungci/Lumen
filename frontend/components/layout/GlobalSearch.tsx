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
  if (contentType === "research_note") return "Research Note";
  if (contentType === "shared_post") return subtype === "kanban" || subtype === "insight" ? "Feed" : "Shared Post";
  if (contentType === "daily_log") return "Daily Log";
  if (contentType === "tag") return "Tag";
  return "Result";
}

interface GlobalSearchProps {
  className?: string;
}

export function GlobalSearch({ className }: GlobalSearchProps) {
  const router = useRouter();

  const inputRef = useRef<HTMLInputElement>(null);

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
        requestAnimationFrame(() => inputRef.current?.focus());
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
        const res = await api.get<{ data?: SearchResultItem[] }>("/search", {
          params: { q: trimmed, limit: 12 },
        });
        if (cancelled) return;
        const rows = res.data?.data ?? [];
        setResults(rows);
        setActiveIndex(0);
      } catch {
        if (cancelled) return;
        setResults([]);
        setError("검색 결과를 불러오지 못했습니다.");
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
    setActiveIndex((prev) => {
      if (direction === "next") return (prev + 1) % results.length;
      return (prev - 1 + results.length) % results.length;
    });
  };

  const openResult = (item: SearchResultItem) => {
    const path = resolveResultPath(item);
    setOpen(false);
    setQuery("");
    router.push(path);
  };

  return (
    <>
      <div className={className}>
        <input
          ref={inputRef}
          className="input h-9 w-full text-sm"
          placeholder="Search ⌘K"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            if (!open) setOpen(true);
          }}
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
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
          }}
        />
      </div>

      {open && (
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            aria-label="Close search"
            className="absolute inset-0 bg-black/35"
            onClick={() => setOpen(false)}
          />
          <div className="relative mx-auto mt-20 w-[min(760px,calc(100%-24px))] overflow-hidden rounded-xl border border-black/10 bg-white shadow-2xl">
            <div className="border-b border-black/10 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Global Search</p>
              <p className="mt-0.5 text-xs text-text-muted">Ctrl/Cmd + K 로 언제든 다시 열 수 있습니다.</p>
            </div>

            <div className="max-h-[62vh] overflow-y-auto p-2">
              {!trimmed && (
                <div className="rounded-lg px-3 py-8 text-center text-sm text-text-muted">
                  검색어를 입력하면 노트, 공유글, 태그, Daily Log를 한 번에 찾을 수 있습니다.
                </div>
              )}

              {trimmed && loading && (
                <div className="rounded-lg px-3 py-8 text-center text-sm text-text-muted">검색 중...</div>
              )}

              {trimmed && !loading && error && (
                <div className="rounded-lg px-3 py-8 text-center text-sm text-red-500">{error}</div>
              )}

              {trimmed && !loading && !error && !hasResults && (
                <div className="rounded-lg px-3 py-8 text-center text-sm text-text-muted">검색 결과가 없습니다.</div>
              )}

              {hasResults && (
                <div className="space-y-1">
                  {results.map((item, index) => {
                    const active = index === activeIndex;
                    return (
                      <button
                        key={`${item.content_type}-${item.id}`}
                        type="button"
                        className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                          active
                            ? "border-primary-300 bg-primary-500/10"
                            : "border-transparent hover:border-black/10 hover:bg-black/[0.03]"
                        }`}
                        onMouseEnter={() => setActiveIndex(index)}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          openResult(item);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-[10px] font-medium text-text-muted">
                            {labelForType(item.content_type, item.subtype)}
                          </span>
                          {item.author?.display_name && (
                            <span className="text-[11px] text-text-muted">{item.author.display_name}</span>
                          )}
                          {item.updated_at && (
                            <span className="ml-auto text-[11px] text-text-muted">
                              {new Date(item.updated_at).toLocaleDateString("ko-KR")}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-sm font-medium text-text-primary">{item.title || "Untitled"}</p>
                        {item.preview && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{item.preview}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
