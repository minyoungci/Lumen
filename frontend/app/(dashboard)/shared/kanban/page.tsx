"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GlassCard } from "@/components/shared/GlassCard";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Column {
  id: string;
  name: string;
  color?: string | null;
  sort_order: number;
}

interface CardRow {
  id: string;
  title: string;
  preview: string;
  kanban_column?: string | null;
  author_name?: string | null;
  created_at?: string | null;
  view_count?: number;
  visibility?: string;
  type?: string;
}

const PRESET_COLORS = ["#FBBF24", "#38BDF8", "#F472B6", "#4ADE80", "#A78BFA", "#FB923C"];

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function EyeIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function InsightCard({ post, onDelete }: { post: CardRow; onDelete?: () => void }) {
  const initial = post.author_name?.[0]?.toUpperCase() ?? "?";
  const relativeTime = formatRelativeTime(post.created_at);

  return (
    <div className="x-feed-card group relative flex gap-3 px-1">
      <div className="x-avatar">{initial}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-semibold text-[14px] text-text-primary leading-none">
            {post.author_name ?? "연구원"}
          </span>
          {post.kanban_column && (
            <span className="text-[12px] text-primary-500 font-medium">
              #{post.kanban_column}
            </span>
          )}
          <span className="text-[12px] text-text-muted ml-auto">{relativeTime}</span>
        </div>
        <p className="text-[15px] leading-[1.6] text-text-primary whitespace-pre-wrap break-words">
          {post.preview || post.title}
        </p>
        <div className="mt-2 flex items-center gap-1 text-[12px] text-text-muted">
          <EyeIcon />
          <span>{post.view_count ?? 0}</span>
        </div>
      </div>
      {/* Delete button — visible on hover */}
      {onDelete && (
        <button
          onClick={onDelete}
          title="삭제"
          className="absolute right-0 top-2 flex h-6 w-6 items-center justify-center rounded-full text-[11px] text-red-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function TopicSelector({
  columns,
  value,
  onChange,
}: {
  columns: Column[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-black/10 bg-white/80 px-2 py-1 text-xs text-text-secondary focus:outline-none focus:border-primary-500/50"
    >
      <option value="">토픽 선택</option>
      {columns.map((c) => (
        <option key={c.id} value={c.name}>
          #{c.name}
        </option>
      ))}
    </select>
  );
}

export default function InsightFeedPage() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [posts, setPosts] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("전체");

  // Compose
  const [draft, setDraft] = useState("");
  const [topic, setTopic] = useState("");
  const [posting, setPosting] = useState(false);
  const [currentUserInitial, setCurrentUserInitial] = useState("나");

  // Column settings panel
  const [showSettings, setShowSettings] = useState(false);
  const [editingCol, setEditingCol] = useState<{ id: string; name: string; color: string } | null>(null);
  const [newColName, setNewColName] = useState("");
  const [newColColor, setNewColColor] = useState(PRESET_COLORS[0]);
  const [addingCol, setAddingCol] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [colRes, postRes, meRes] = await Promise.allSettled([
        api.get("/kanban/columns"),
        api.get("/shared-posts", { params: { limit: 100 } }),
        api.get("/users/me"),
      ]);

      const cols: Column[] = colRes.status === "fulfilled" ? (colRes.value.data?.data ?? []) : [];
      setColumns(cols);

      const allPosts: CardRow[] = postRes.status === "fulfilled" ? (postRes.value.data?.data ?? []) : [];
      setPosts(allPosts.filter((p) => p.type === "kanban" || p.type === "insight"));

      if (meRes.status === "fulfilled") {
        const me = meRes.value.data?.data ?? meRes.value.data;
        const name = me?.display_name ?? me?.full_name ?? me?.email ?? "나";
        setCurrentUserInitial(name[0]?.toUpperCase() ?? "나");
      }
    } catch {
      setColumns([]);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filteredPosts = useMemo(() => {
    if (activeTab === "전체") return posts;
    return posts.filter((p) => p.kanban_column === activeTab);
  }, [posts, activeTab]);

  const handlePost = async () => {
    if (!draft.trim() || posting) return;
    setPosting(true);
    try {
      await api.post("/shared-posts", {
        type: "insight",
        title: draft.slice(0, 100),
        content: { text: draft },
        kanban_column: topic || null,
        word_count: draft.trim().split(/\s+/).filter(Boolean).length,
        visibility: "shared",
      });
      setDraft("");
      setTopic("");
      await load();
    } finally {
      setPosting(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm("이 인사이트를 삭제하시겠습니까?")) return;
    try {
      await api.delete(`/shared-posts/${postId}`);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch {
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  // Column CRUD
  const onAddColumn = async (e: FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;
    setAddingCol(true);
    try {
      await api.post("/kanban/columns", { name: newColName.trim(), color: newColColor });
      setNewColName("");
      await load();
    } finally {
      setAddingCol(false);
    }
  };

  const onSaveColumn = async (colId: string) => {
    if (!editingCol) return;
    await api.patch(`/kanban/columns/${colId}`, { name: editingCol.name, color: editingCol.color });
    setEditingCol(null);
    await load();
  };

  const onDeleteColumn = async (col: Column) => {
    if (!confirm(`"${col.name}" 토픽을 삭제할까요?`)) return;
    await api.delete(`/kanban/columns/${col.id}`);
    await load();
  };

  const tabs = ["전체", ...columns.map((c) => c.name)];

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">인사이트 피드</h1>
          <p className="text-sm text-text-muted">팀의 발견과 아이디어를 공유하세요</p>
        </div>
        <button
          onClick={() => setShowSettings((s) => !s)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors",
            showSettings
              ? "border-primary-500/40 bg-primary-500/8 text-primary-600"
              : "border-black/10 bg-white/80 text-text-secondary hover:bg-white hover:text-text-primary"
          )}
        >
          ⚙️ <span className="hidden sm:inline">토픽 관리</span>
        </button>
      </div>

      {/* ── Topic Settings Panel ── */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <GlassCard variant="elevated" padding="md">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">토픽 관리</h3>
              <div className="space-y-2">
                {columns.map((col) => (
                  <div key={col.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-black/[0.03]">
                    {editingCol?.id === col.id ? (
                      <>
                        <input
                          className="input flex-1 py-1.5 text-sm"
                          value={editingCol.name}
                          onChange={(e) => setEditingCol({ ...editingCol, name: e.target.value })}
                          autoFocus
                        />
                        <div className="flex gap-1">
                          {PRESET_COLORS.map((clr) => (
                            <button
                              key={clr}
                              type="button"
                              style={{ backgroundColor: clr }}
                              className={cn(
                                "h-5 w-5 rounded-full border-2 transition-transform hover:scale-110",
                                editingCol.color === clr ? "border-gray-700 scale-110" : "border-transparent"
                              )}
                              onClick={() => setEditingCol({ ...editingCol, color: clr })}
                            />
                          ))}
                        </div>
                        <button
                          onClick={() => onSaveColumn(col.id)}
                          className="rounded-md bg-primary-500 px-2 py-1 text-xs font-medium text-white hover:bg-primary-600"
                        >
                          저장
                        </button>
                        <button
                          onClick={() => setEditingCol(null)}
                          className="rounded-md border border-black/10 px-2 py-1 text-xs text-text-secondary hover:bg-black/5"
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="h-3.5 w-3.5 flex-shrink-0 rounded-full" style={{ backgroundColor: col.color ?? "#e5e7eb" }} />
                        <span className="flex-1 text-sm text-text-primary">#{col.name}</span>
                        <button
                          onClick={() => setEditingCol({ id: col.id, name: col.name, color: col.color ?? PRESET_COLORS[0] })}
                          className="rounded px-2 py-0.5 text-xs text-text-secondary hover:bg-black/8 hover:text-text-primary"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => onDeleteColumn(col)}
                          className="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-50"
                        >
                          삭제
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <form onSubmit={onAddColumn} className="mt-4 flex items-center gap-2 border-t border-black/[0.07] pt-4">
                <input
                  className="input flex-1 py-1.5 text-sm"
                  placeholder="새 토픽 이름..."
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                />
                <div className="flex gap-1">
                  {PRESET_COLORS.map((clr) => (
                    <button
                      key={clr}
                      type="button"
                      style={{ backgroundColor: clr }}
                      className={cn(
                        "h-5 w-5 rounded-full border-2 transition-transform hover:scale-110",
                        newColColor === clr ? "border-gray-700 scale-110" : "border-transparent"
                      )}
                      onClick={() => setNewColColor(clr)}
                    />
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={addingCol}
                  className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-60"
                >
                  {addingCol ? "..." : "+ 추가"}
                </button>
              </form>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Compose Box ── */}
      <GlassCard padding="md">
        <div className="flex gap-3">
          <div className="x-avatar">{currentUserInitial}</div>
          <div className="flex-1">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 500))}
              placeholder="오늘의 발견, 아이디어, 인사이트를 공유하세요..."
              className="w-full resize-none bg-transparent text-[15px] text-text-primary outline-none placeholder:text-text-muted/50 min-h-[80px] leading-[1.6]"
            />
            <div className="mt-2 flex items-center justify-between border-t border-black/[0.06] pt-2">
              <TopicSelector columns={columns} value={topic} onChange={setTopic} />
              <div className="flex items-center gap-3">
                <span className={cn("text-[12px]", draft.length > 450 ? "text-amber-500" : "text-text-muted")}>
                  {draft.length}/500
                </span>
                <button
                  onClick={() => void handlePost()}
                  disabled={!draft.trim() || posting}
                  className="rounded-full bg-primary-500 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40 hover:bg-primary-600 transition-colors"
                >
                  {posting ? "공유 중..." : "공유하기"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* ── Topic Filter Tabs ── */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
              activeTab === tab
                ? "bg-primary-500 text-white"
                : "bg-black/[0.05] text-text-secondary hover:bg-black/[0.08] hover:text-text-primary"
            )}
          >
            {tab === "전체" ? "전체" : `#${tab}`}
          </button>
        ))}
      </div>

      {/* ── Feed ── */}
      <GlassCard padding="md">
        {loading ? (
          <CardSkeleton />
        ) : filteredPosts.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-text-muted text-sm">아직 공유된 인사이트가 없습니다.</p>
            <p className="text-text-muted/60 text-xs mt-1">위 입력창에서 첫 번째 인사이트를 공유해보세요!</p>
          </div>
        ) : (
          <div>
            {filteredPosts.map((post) => (
              <InsightCard
                key={post.id}
                post={post}
                onDelete={() => void handleDeletePost(post.id)}
              />
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
