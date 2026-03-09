"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { contentTone } from "@/lib/contentColor";
import { hexToRgba, resolveMemberColor } from "@/lib/memberColor";
import { useProjectStore } from "@/store/project";

interface Column { id: string; name: string; color?: string | null; }
interface CardRow {
  id: string; user_id?: string; title: string; preview: string; kanban_column?: string | null;
  author_name?: string | null; author_avatar_url?: string | null; author_member_color?: string | null;
  author_status_message?: string | null; author_pronouns?: string | null; created_at?: string | null; view_count?: number; type?: string;
}
interface CurrentUserRow {
  id?: string; display_name?: string; full_name?: string; email?: string; avatar_url?: string | null;
  member_color?: string | null; role?: "admin" | "member";
}
interface CommentSummaryAuthor { id: string; display_name?: string | null; avatar_url?: string | null; member_color?: string | null; }
interface CommentSummary { total: number; recent_authors: CommentSummaryAuthor[]; }
interface CommentAuthor {
  id: string; display_name: string; avatar_url?: string | null; member_color?: string | null; status_message?: string | null; pronouns?: string | null;
}
interface CommentRow { id: string; body: Record<string, unknown>; created_at?: string; author: CommentAuthor; replies: CommentRow[]; }

const ALL_UPDATES = "All updates";

function formatRelativeTime(value?: string | null) {
  if (!value) return "Recently";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function formatDateTime(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function commentText(body: Record<string, unknown> | undefined) {
  const text = body?.text;
  return typeof text === "string" ? text : "";
}

export default function InsightFeedPage() {
  const { currentProjectId, projects } = useProjectStore();
  const [columns, setColumns] = useState<Column[]>([]);
  const [posts, setPosts] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>(ALL_UPDATES);
  const [draft, setDraft] = useState("");
  const [topic, setTopic] = useState("");
  const [posting, setPosting] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUserRow>({ display_name: "You", role: "member" });
  const [commentSummaries, setCommentSummaries] = useState<Record<string, CommentSummary>>({});
  const [commentsOpen, setCommentsOpen] = useState<Record<string, boolean>>({});
  const [commentsByPost, setCommentsByPost] = useState<Record<string, CommentRow[]>>({});
  const [commentsLoading, setCommentsLoading] = useState<Record<string, boolean>>({});
  const [commentsError, setCommentsError] = useState<Record<string, string | null>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentBusyId, setCommentBusyId] = useState<string | null>(null);
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const projectName = projects.find((project) => project.id === currentProjectId)?.name ?? null;
  const feedTone = contentTone("feed");
  const commentTone = contentTone("comment");

  const loadCommentSummaries = useCallback(async (postIds: string[]) => {
    const ids = Array.from(new Set(postIds.filter(Boolean)));
    if (ids.length === 0) return setCommentSummaries({});
    try {
      const res = await api.get("/comments/summary", { params: { content_type: "shared_post", content_ids: ids.join(",") } });
      const raw = (res.data?.data ?? {}) as Record<string, { total?: number; recent_authors?: CommentSummaryAuthor[] }>;
      const next: Record<string, CommentSummary> = {};
      for (const id of ids) next[id] = { total: Number(raw[id]?.total ?? 0), recent_authors: Array.isArray(raw[id]?.recent_authors) ? raw[id].recent_authors : [] };
      setCommentSummaries((prev) => ({ ...prev, ...next }));
    } catch {}
  }, []);

  const loadCommentsForPost = useCallback(async (postId: string) => {
    setCommentsLoading((prev) => ({ ...prev, [postId]: true }));
    setCommentsError((prev) => ({ ...prev, [postId]: null }));
    try {
      const res = await api.get("/comments", { params: { content_type: "shared_post", content_id: postId, limit: 50 } });
      setCommentsByPost((prev) => ({ ...prev, [postId]: (res.data?.data ?? []) as CommentRow[] }));
    } catch {
      setCommentsByPost((prev) => ({ ...prev, [postId]: [] }));
      setCommentsError((prev) => ({ ...prev, [postId]: "Could not load comments." }));
    } finally {
      setCommentsLoading((prev) => ({ ...prev, [postId]: false }));
    }
  }, []);

  const refreshPostComments = useCallback(async (postId: string) => {
    await Promise.all([loadCommentsForPost(postId), loadCommentSummaries([postId])]);
  }, [loadCommentSummaries, loadCommentsForPost]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const projectParam = { project_id: currentProjectId ?? undefined };
      const [colRes, postRes, meRes] = await Promise.allSettled([
        api.get("/kanban/columns", { params: projectParam }),
        api.get("/shared-posts", { params: { limit: 100, ...projectParam } }),
        api.get("/users/me"),
      ]);
      setColumns(colRes.status === "fulfilled" ? ((colRes.value.data?.data ?? []) as Column[]) : []);
      const list = postRes.status === "fulfilled" ? ((postRes.value.data?.data ?? []) as CardRow[]) : [];
      const feedPosts = list.filter((post) => post.type === "kanban" || post.type === "insight").sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      setPosts(feedPosts);
      void loadCommentSummaries(feedPosts.map((post) => post.id));
      if (meRes.status === "fulfilled") {
        const me = (meRes.value.data?.data ?? meRes.value.data ?? {}) as CurrentUserRow;
        setCurrentUser({
          id: typeof me.id === "string" ? me.id : undefined,
          display_name: typeof me.display_name === "string" ? me.display_name : typeof me.full_name === "string" ? me.full_name : typeof me.email === "string" ? me.email : "You",
          avatar_url: typeof me.avatar_url === "string" ? me.avatar_url : null,
          member_color: typeof me.member_color === "string" ? me.member_color : null,
          role: me.role === "admin" ? "admin" : "member",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [currentProjectId, loadCommentSummaries]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const element = draftTextareaRef.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
    element.style.overflowY = "hidden";
  }, [draft]);

  const filteredPosts = useMemo(() => activeTab === ALL_UPDATES ? posts : posts.filter((post) => post.kanban_column === activeTab), [activeTab, posts]);
  const columnColorByName = useMemo(() => Object.fromEntries(columns.filter((column) => typeof column.color === "string" && column.color.trim()).map((column) => [column.name, column.color as string])), [columns]);
  const tabs = [ALL_UPDATES, ...columns.map((column) => column.name)];
  const threadedCount = posts.filter((post) => (commentSummaries[post.id]?.total ?? 0) > 0).length;

  const handlePost = async () => {
    if (!draft.trim() || posting) return;
    setPosting(true);
    try {
      const trimmed = draft.trim();
      await api.post("/shared-posts", { type: "insight", title: trimmed.slice(0, 100), content: { text: trimmed }, kanban_column: topic || null, word_count: trimmed.split(/\s+/).filter(Boolean).length, visibility: "shared" }, { params: { project_id: currentProjectId ?? undefined } });
      setDraft(""); setTopic(""); await load();
    } finally {
      setPosting(false);
    }
  };

  const toggleComments = (postId: string) => {
    setCommentsOpen((prev) => {
      const nextOpen = !prev[postId];
      if (nextOpen && commentsByPost[postId] === undefined && !commentsLoading[postId]) void loadCommentsForPost(postId);
      return { ...prev, [postId]: nextOpen };
    });
  };

  const submitComment = async (postId: string) => {
    const bodyText = (commentDrafts[postId] ?? "").trim();
    if (!bodyText) return;
    setCommentBusyId(postId);
    try {
      await api.post("/comments", { content_type: "shared_post", content_id: postId, parent_id: null, body: { text: bodyText } });
      setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
      await refreshPostComments(postId);
    } finally {
      setCommentBusyId(null);
    }
  };

  const handleDeletePost = async (postId: string) => {
    const target = posts.find((post) => post.id === postId);
    const canDelete = currentUser.role === "admin" || (Boolean(currentUser.id) && target?.user_id === currentUser.id);
    if (!canDelete) return window.alert("You do not have permission to delete this update.");
    if (!window.confirm("Delete this update?")) return;
    await api.delete(`/shared-posts/${postId}`);
    setPosts((prev) => prev.filter((post) => post.id !== postId));
  };

  const renderComment = (row: CommentRow, depth = 0): JSX.Element => {
    const authorColor = resolveMemberColor(row.author?.id, row.author?.member_color);
    return (
      <div key={row.id} className={depth > 0 ? "ml-5 mt-2" : ""}>
        <div className="rounded-[18px] border border-black/[0.07] bg-white/86 p-3" style={{ borderLeftWidth: 3, borderLeftColor: hexToRgba(authorColor, 0.5) }}>
          <div className="flex items-start gap-2.5">
            <UserAvatar displayName={row.author?.display_name} avatarUrl={row.author?.avatar_url} userId={row.author?.id} memberColor={row.author?.member_color} className="h-8 w-8 shrink-0 text-[10px]" alt="" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium" style={{ color: authorColor }}>{row.author?.display_name || "Unknown"}</span>
                <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: commentTone.bg, borderColor: commentTone.border, color: commentTone.text }}>Comment</span>
                <span className="text-[11px] text-text-muted">{formatDateTime(row.created_at)}</span>
              </div>
              {row.author?.status_message ? <p className="mt-0.5 text-[11px] text-text-muted">{row.author.status_message}</p> : null}
              <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">{commentText(row.body) || "(No content)"}</p>
            </div>
          </div>
        </div>
        {row.replies?.length ? <div className="space-y-1">{row.replies.map((reply) => renderComment(reply, depth + 1))}</div> : null}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="bg-white/88 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Updates</p>
            <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-text-primary md:text-[38px]">Project signal, without extra noise.</h1>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-text-secondary">{projectName ? `${projectName} is active. Use updates for short progress notes, blockers, and requests for attention.` : "You are in Personal workspace. Updates become more useful once they belong to a project team space."}</p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link href="/shared/new?type=article" className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03]">New doc instead</Link>
              <Link href="/notifications" className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03]">Open inbox</Link>
            </div>
          </div>
          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-3 lg:grid-cols-1">
            <div className="bg-white/84 p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Updates</p><p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{posts.length}</p><p className="mt-1 text-sm text-text-secondary">Visible in the current scope.</p></div>
            <div className="bg-white/84 p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Topics</p><p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{columns.length}</p><p className="mt-1 text-sm text-text-secondary">Keep them sparse.</p></div>
            <div className="bg-white/84 p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Threads</p><p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{threadedCount}</p><p className="mt-1 text-sm text-text-secondary">Updates with comments attached.</p></div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="space-y-4">
        <div className="flex gap-3">
          <UserAvatar displayName={currentUser.display_name} avatarUrl={currentUser.avatar_url} userId={currentUser.id} memberColor={currentUser.member_color} className="h-10 w-10 shrink-0 text-xs" alt="" />
          <div className="flex-1">
            <p className="text-sm font-medium text-text-primary">Post a quick update</p>
            <p className="text-xs text-text-muted">Short, direct, and easy to scan.</p>
            <textarea ref={draftTextareaRef} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="What changed? What should the team know next?" className="mt-3 min-h-[96px] w-full resize-none bg-transparent text-[15px] leading-[1.6] text-text-primary outline-none placeholder:text-text-muted/50" />
            <div className="mt-3 flex flex-col gap-3 border-t border-black/[0.06] pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <select value={topic} onChange={(event) => setTopic(event.target.value)} className="rounded-lg border border-black/10 bg-white/80 px-2 py-1 text-xs text-text-secondary focus:border-primary-500/50 focus:outline-none">
                  <option value="">No topic</option>
                  {columns.map((column) => <option key={column.id} value={column.name}>#{column.name}</option>)}
                </select>
                <span className="text-[12px] text-text-muted">{draft.length} chars</span>
              </div>
              <button onClick={() => void handlePost()} disabled={!draft.trim() || posting} className="rounded-full bg-primary-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-40">{posting ? "Posting..." : "Share update"}</button>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {tabs.map((tab) => {
          const tone = tab === ALL_UPDATES ? null : columnColorByName[tab];
          const active = activeTab === tab;
          return (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${active ? "text-white" : "border-black/5 bg-black/[0.05] text-text-secondary hover:bg-black/[0.08] hover:text-text-primary"}`} style={active ? { backgroundColor: tone ?? feedTone.base, borderColor: hexToRgba(tone ?? feedTone.base, 0.5) } : tone ? { borderColor: hexToRgba(tone, 0.45), backgroundColor: hexToRgba(tone, 0.08), color: tone } : undefined}>
              {tab === ALL_UPDATES ? ALL_UPDATES : `#${tab}`}
            </button>
          );
        })}
      </div>

      <GlassCard padding="md">
        {loading ? <CardSkeleton /> : filteredPosts.length === 0 ? (
          <div className="py-16 text-center"><p className="text-sm text-text-muted">{currentProjectId ? "No updates yet in this project." : "No updates yet in Personal workspace."}</p><p className="mt-1 text-xs text-text-muted/60">Start with one short signal above.</p></div>
        ) : (
          <div className="space-y-4">
            {filteredPosts.map((post) => {
              const summary = commentSummaries[post.id] ?? { total: 0, recent_authors: [] };
              const isOpen = Boolean(commentsOpen[post.id]);
              const topicColor = post.kanban_column ? columnColorByName[post.kanban_column] : null;
              const authorColor = resolveMemberColor(post.user_id, post.author_member_color);
              const canDelete = currentUser.role === "admin" || (Boolean(currentUser.id) && post.user_id === currentUser.id);
              return (
                <div key={post.id} className="rounded-[26px] border border-black/[0.07] bg-white/82 p-4">
                  <div className="flex gap-3">
                    <UserAvatar displayName={post.author_name} avatarUrl={post.author_avatar_url} userId={post.user_id} memberColor={post.author_member_color} className="h-10 w-10 shrink-0 text-[11px]" alt="" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold" style={{ color: authorColor }}>{post.author_name ?? "Unknown"}</span>
                        <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: feedTone.bg, borderColor: feedTone.border, color: feedTone.text }}>Update</span>
                        {post.kanban_column ? <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: hexToRgba(topicColor ?? feedTone.base, 0.12), borderColor: hexToRgba(topicColor ?? feedTone.base, 0.4), color: topicColor ?? feedTone.base }}>#{post.kanban_column}</span> : null}
                        <span className="ml-auto text-xs text-text-muted">{formatRelativeTime(post.created_at)}</span>
                      </div>
                      {post.author_status_message ? <p className="mt-1 line-clamp-1 text-[12px] text-text-muted">{post.author_status_message}</p> : null}
                      <p className="mt-3 text-base font-semibold text-text-primary">{post.title || "Untitled update"}</p>
                      {post.preview && post.preview !== post.title ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-text-secondary">{post.preview}</p> : null}
                      <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-text-muted">
                        <span className="rounded-full border border-black/10 bg-white px-2 py-1">{post.view_count ?? 0} views</span>
                        <button onClick={() => toggleComments(post.id)} className={`rounded-full border px-2 py-1 transition-colors ${isOpen ? "border-primary-400/40 bg-primary-500/10 text-primary-700" : "border-black/10 bg-white text-text-secondary hover:bg-black/[0.04]"}`}>Comments {summary.total}</button>
                        {summary.recent_authors.length > 0 ? <div className="ml-auto flex items-center">{summary.recent_authors.slice(0, 3).map((author, index) => <div key={`${author.id}-${index}`} className={index === 0 ? "" : "-ml-2"}><UserAvatar displayName={author.display_name} avatarUrl={author.avatar_url} userId={author.id} memberColor={author.member_color} className="h-5 w-5 border border-white text-[8px]" alt="" /></div>)}</div> : null}
                        {canDelete ? <button onClick={() => void handleDeletePost(post.id)} className="rounded-full border border-red-200/60 bg-red-50 px-2 py-1 text-red-600 transition-colors hover:bg-red-100">Delete</button> : null}
                      </div>
                    </div>
                  </div>
                  {isOpen ? <div className="mt-4 rounded-[22px] border border-black/[0.07] bg-white/72 p-3">{commentsLoading[post.id] ? <p className="text-xs text-text-muted">Loading thread...</p> : <div className="space-y-3">{commentsError[post.id] ? <div className="rounded-lg border border-red-200 bg-red-50/70 px-3 py-2 text-xs text-red-600">{commentsError[post.id]}</div> : null}<div className="flex gap-2 rounded-[18px] border p-2" style={{ borderColor: commentTone.border, backgroundColor: commentTone.soft }}><textarea className="input min-h-[64px] flex-1 resize-none text-sm" placeholder="Add a comment to this update" value={commentDrafts[post.id] ?? ""} onChange={(event) => setCommentDrafts((prev) => ({ ...prev, [post.id]: event.target.value }))} /><button onClick={() => void submitComment(post.id)} disabled={commentBusyId === post.id || !(commentDrafts[post.id] ?? "").trim()} className="h-9 self-end rounded-lg px-3 text-xs font-medium text-white disabled:opacity-60" style={{ backgroundColor: commentTone.base }}>{commentBusyId === post.id ? "..." : "Comment"}</button></div>{(commentsByPost[post.id] ?? []).length === 0 ? <p className="text-xs text-text-muted">No comments yet.</p> : <div className="space-y-2">{(commentsByPost[post.id] ?? []).map((row) => renderComment(row))}</div>}</div>}</div> : null}
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
