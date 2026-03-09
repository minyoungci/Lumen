"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { api } from "@/lib/api";

interface KnowledgeResultItem {
  source_type: string;
  source_id: string;
  source_subtype?: string | null;
  title: string;
  summary?: string;
  snippet?: string;
  score: number;
  match_reason: string;
  url?: string;
}

interface KnowledgeAssistPanelProps {
  query: string;
  topK?: number;
}

const MIN_QUERY_LENGTH = 20;

function modeLabel(matchReason?: string): string {
  if (matchReason === "semantic") return "Semantic";
  if (matchReason === "keyword") return "Keyword";
  return "Hybrid";
}

function sourceLabel(result: KnowledgeResultItem): string {
  if (result.source_type === "research_note") return "Note";
  if (result.source_type === "shared_post") {
    return result.source_subtype === "kanban" || result.source_subtype === "insight" ? "Update" : "Doc";
  }
  if (result.source_type === "daily_log") return "Journal";
  return "Context";
}

function resolveResultPath(result: KnowledgeResultItem): string {
  if (result.url && result.url.trim()) return result.url;
  if (result.source_type === "research_note") return `/research-notes/${result.source_id}`;
  if (result.source_type === "shared_post") {
    if (result.source_subtype === "kanban" || result.source_subtype === "insight") {
      return `/shared/feed/${result.source_id}`;
    }
    return `/shared/articles/${result.source_id}`;
  }
  if (result.source_type === "daily_log") return "/daily-log/archive";
  return "/home";
}

export function KnowledgeAssistPanel({ query, topK = 6 }: KnowledgeAssistPanelProps) {
  const [results, setResults] = useState<KnowledgeResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    if (normalizedQuery.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.post("/knowledge/retrieve", {
          query: normalizedQuery,
          top_k: topK,
        });
        if (cancelled) return;
        setResults(response.data?.data?.results ?? []);
      } catch {
        if (cancelled) return;
        setResults([]);
        setError("Relevant context could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 550);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedQuery, topK]);

  const sendFeedback = async (result: KnowledgeResultItem, feedbackType: "up" | "down") => {
    try {
      await api.post("/knowledge/feedback", {
        query_text: normalizedQuery,
        target_source_type: result.source_type,
        target_source_id: result.source_id,
        feedback_type: feedbackType,
      });
    } catch {
      // Feedback is best-effort.
    }
  };

  return (
    <GlassCard variant="elevated" padding="md" className="space-y-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Knowledge assist</p>
        <p className="mt-1 text-xs leading-5 text-text-muted">
          Recommendations update from the draft you are writing so you can pull in older notes, docs, and updates
          without breaking flow.
        </p>
      </div>

      {normalizedQuery.length < MIN_QUERY_LENGTH ? (
        <div className="rounded-2xl border border-black/[0.06] bg-black/[0.03] px-3 py-4 text-xs text-text-muted">
          Keep writing for a moment longer. Suggestions begin after roughly {MIN_QUERY_LENGTH} characters.
        </div>
      ) : null}

      {normalizedQuery.length >= MIN_QUERY_LENGTH && loading ? (
        <div className="rounded-2xl border border-black/[0.06] bg-black/[0.03] px-3 py-4 text-xs text-text-muted">
          Looking through your workspace context...
        </div>
      ) : null}

      {normalizedQuery.length >= MIN_QUERY_LENGTH && !loading && error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-4 text-xs text-red-600">{error}</div>
      ) : null}

      {normalizedQuery.length >= MIN_QUERY_LENGTH && !loading && !error && results.length === 0 ? (
        <div className="rounded-2xl border border-black/[0.06] bg-black/[0.03] px-3 py-4 text-xs text-text-muted">
          No related context found for this draft yet.
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="space-y-2">
          {results.map((result) => (
            <div
              key={`${result.source_type}:${result.source_id}`}
              className="rounded-2xl border border-black/[0.06] bg-white/80 px-3 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-[10px] font-medium text-text-muted">
                  {sourceLabel(result)}
                </span>
                <span className="rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary-700">
                  {Math.round((result.score || 0) * 100)}%
                </span>
                <span className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-[10px] font-medium text-text-muted">
                  {modeLabel(result.match_reason)}
                </span>
              </div>

              <p className="mt-2 text-sm font-semibold text-text-primary">{result.title || "Untitled"}</p>
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-text-muted">{result.summary || result.snippet}</p>

              <div className="mt-3 flex items-center justify-between gap-2">
                <Link
                  href={resolveResultPath(result)}
                  className="text-xs font-medium text-primary-600 transition-colors hover:text-primary-700 hover:underline"
                >
                  Open reference
                </Link>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded-full border border-black/10 px-2.5 py-1 text-[11px] text-text-muted transition-colors hover:bg-black/[0.03]"
                    onClick={() => void sendFeedback(result, "up")}
                  >
                    Useful
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-black/10 px-2.5 py-1 text-[11px] text-text-muted transition-colors hover:bg-black/[0.03]"
                    onClick={() => void sendFeedback(result, "down")}
                  >
                    Miss
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </GlassCard>
  );
}
