"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { GlassCard } from "@/components/shared/GlassCard";
import { RichTextEditor, TiptapContent, textToTiptap } from "@/components/shared/RichTextEditor";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { api } from "@/lib/api";
import { hexToRgba, resolveMemberColor } from "@/lib/memberColor";
import {
  buildPaperReviewText,
  buildPaperReviewTitle,
  createPaperReviewDoc,
  EMPTY_DOC_CONTENT,
  EMPTY_PAPER_REVIEW_META,
  extractTextFromTiptap,
  getPaperReviewDecisionLabel,
  isPaperReviewTitle,
  normalizePaperReviewMeta,
  paperReviewDecisionOptions,
  parsePaperReviewDoc,
  stripPaperReviewPrefix,
  type PaperReviewDecision,
  type PaperReviewMeta,
} from "@/lib/paperReview";

interface CommentAuthor {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  member_color?: string | null;
  status_message?: string | null;
  pronouns?: string | null;
}

interface CommentReaction {
  emoji: string;
  count: number;
  reacted?: boolean;
}

interface CommentRow {
  id: string;
  body: Record<string, unknown>;
  is_edited?: boolean;
  created_at?: string;
  reactions?: CommentReaction[];
  author: CommentAuthor;
  replies: CommentRow[];
}

const DEFAULT_COMMENT_REACTIONS = ["Agree", "Question", "Useful", "Follow up"];

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function calcReadingTime(text: string): number {
  return Math.max(1, Math.ceil(countWords(text) / 220));
}

function formatDate(value?: string): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function formatDateTime(value?: string): string {
  if (!value) return "";
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function commentText(body: Record<string, unknown> | undefined): string {
  if (!body || typeof body !== "object") return "";
  return typeof body.text === "string" ? body.text : "";
}

export default function SharedArticleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [authorColor, setAuthorColor] = useState("#4f46e5");
  const [authorAvatar, setAuthorAvatar] = useState<string | null>(null);
  const [authorStatus, setAuthorStatus] = useState<string | null>(null);
  const [authorPronouns, setAuthorPronouns] = useState<string | null>(null);
  const [dateStr, setDateStr] = useState("");
  const [initialContent, setInitialContent] = useState<TiptapContent>(EMPTY_DOC_CONTENT);
  const [editorKey, setEditorKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"read" | "edit">("read");
  const [wordCount, setWordCount] = useState(0);
  const [isPaperReview, setIsPaperReview] = useState(false);
  const [reviewMeta, setReviewMeta] = useState<PaperReviewMeta>(EMPTY_PAPER_REVIEW_META);
  const contentRef = useRef<{ json: TiptapContent | null; text: string }>({ json: EMPTY_DOC_CONTENT, text: "" });
  const [myUserId, setMyUserId] = useState("");
  const [myRole, setMyRole] = useState<"admin" | "member">("member");
  const [postOwnerId, setPostOwnerId] = useState("");
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyOpen, setReplyOpen] = useState<Record<string, boolean>>({});
  const [actionId, setActionId] = useState<string | null>(null);

  const loadComments = useCallback(async () => {
    if (!id) return;
    setCommentsLoading(true);
    try {
      const res = await api.get("/comments", { params: { content_type: "shared_post", content_id: id, limit: 80 } });
      setComments(res.data?.data ?? []);
    } catch {
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let mounted = true;
    if (!id) return;
    const load = async () => {
      setLoading(true);
      try {
        const [postRes, meRes] = await Promise.all([api.get(`/shared-posts/${id}`), api.get("/users/me")]);
        if (!mounted) return;
        const row = postRes.data?.data;
        if (!row) return;
        const rawTitle = typeof row.title === "string" ? row.title : "";
        const rawContent = row.content?.tiptap ?? textToTiptap(typeof row.content?.text === "string" ? row.content.text : "");
        const parsedReview = parsePaperReviewDoc(rawContent);
        const nextIsPaperReview = Boolean(parsedReview) || isPaperReviewTitle(rawTitle);
        const nextReviewMeta = nextIsPaperReview
          ? normalizePaperReviewMeta({ ...parsedReview?.meta, paperTitle: parsedReview?.meta.paperTitle || stripPaperReviewPrefix(rawTitle) })
          : EMPTY_PAPER_REVIEW_META;
        const nextBody = nextIsPaperReview ? parsedReview?.body ?? rawContent : rawContent;
        const nextText = extractTextFromTiptap(nextBody);
        setTitle(rawTitle);
        setIsPaperReview(nextIsPaperReview);
        setReviewMeta(nextReviewMeta);
        setInitialContent(nextBody);
        setEditorKey((value) => value + 1);
        contentRef.current = { json: nextBody, text: nextText };
        setWordCount(countWords(nextText));
        setAuthorName(row.author_name || row.author?.display_name || row.created_by_name || "");
        setAuthorColor(resolveMemberColor(row.user_id, row.author_member_color));
        setAuthorAvatar(typeof row.author_avatar_url === "string" ? row.author_avatar_url : null);
        setAuthorStatus(typeof row.author_status_message === "string" && row.author_status_message.trim() ? row.author_status_message : null);
        setAuthorPronouns(typeof row.author_pronouns === "string" && row.author_pronouns.trim() ? row.author_pronouns : null);
        setDateStr(formatDate(typeof row.created_at === "string" ? row.created_at : undefined));
        setPostOwnerId(typeof row.user_id === "string" ? row.user_id : "");
        const me = meRes.data?.data ?? {};
        setMyUserId(typeof me.id === "string" ? me.id : "");
        setMyRole(me.role === "admin" ? "admin" : "member");
        void loadComments();
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [id, loadComments]);

  const handleEditorChange = (json: TiptapContent, text: string) => {
    contentRef.current = { json, text };
    setWordCount(countWords(text));
  };

  const canManagePost = myRole === "admin" || (Boolean(myUserId) && myUserId === postOwnerId);
  const displayTitle = useMemo(() => {
    if (!isPaperReview) return title || "Untitled doc";
    return reviewMeta.paperTitle || stripPaperReviewPrefix(title) || title || "Untitled paper review";
  }, [isPaperReview, reviewMeta.paperTitle, title]);

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!id) return;
    if (!canManagePost) return window.alert("You do not have permission to edit this doc.");
    if (isPaperReview && !reviewMeta.paperTitle.trim()) return window.alert("Add the paper title before saving.");
    if (!isPaperReview && !title.trim()) return window.alert("Add a title before saving.");
    setSaving(true);
    try {
      const bodyJson = contentRef.current.json ?? initialContent ?? EMPTY_DOC_CONTENT;
      const bodyText = contentRef.current.text || extractTextFromTiptap(bodyJson);
      if (isPaperReview) {
        const normalizedMeta = normalizePaperReviewMeta(reviewMeta);
        const nextTitle = buildPaperReviewTitle(normalizedMeta.paperTitle);
        await api.patch(`/shared-posts/${id}`, {
          title: nextTitle,
          content: { text: buildPaperReviewText(normalizedMeta, bodyText), tiptap: createPaperReviewDoc(normalizedMeta, bodyJson) },
        });
        setTitle(nextTitle);
        setReviewMeta(normalizedMeta);
      } else {
        await api.patch(`/shared-posts/${id}`, { title: title.trim(), content: { text: bodyText, tiptap: bodyJson } });
        setTitle(title.trim());
      }
      setInitialContent(bodyJson);
      contentRef.current = { json: bodyJson, text: bodyText };
      setWordCount(countWords(bodyText));
      setViewMode("read");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!canManagePost) return window.alert("You do not have permission to delete this doc.");
    if (!id || !window.confirm("Delete this doc?")) return;
    await api.delete(`/shared-posts/${id}`);
    router.push("/shared/articles");
  };

  const submitComment = async (parentId?: string) => {
    if (!id) return;
    const bodyText = parentId ? (replyDrafts[parentId] || "").trim() : commentDraft.trim();
    if (!bodyText) return;
    const actionKey = parentId ? `reply-${parentId}` : "comment-create";
    setActionId(actionKey);
    try {
      await api.post("/comments", { content_type: "shared_post", content_id: id, parent_id: parentId ?? null, body: { text: bodyText } });
      if (parentId) {
        setReplyDrafts((prev) => ({ ...prev, [parentId]: "" }));
        setReplyOpen((prev) => ({ ...prev, [parentId]: false }));
      } else {
        setCommentDraft("");
      }
      await loadComments();
    } finally {
      setActionId(null);
    }
  };

  const removeComment = async (commentId: string) => {
    if (!window.confirm("Delete this comment?")) return;
    setActionId(`delete-${commentId}`);
    try {
      await api.delete(`/comments/${commentId}`);
      await loadComments();
    } finally {
      setActionId(null);
    }
  };

  const toggleReaction = async (commentId: string, emoji: string) => {
    setActionId(`reaction-${commentId}-${emoji}`);
    try {
      await api.post(`/comments/${commentId}/reactions`, { emoji });
      await loadComments();
    } finally {
      setActionId(null);
    }
  };

  const renderComment = (row: CommentRow, depth = 0) => {
    const color = resolveMemberColor(row.author?.id, row.author?.member_color);
    const text = commentText(row.body);
    const canDelete = row.author?.id === myUserId || myRole === "admin";
    const knownReactions = row.reactions ?? [];
    const extraReactions = DEFAULT_COMMENT_REACTIONS.filter((reaction) => !knownReactions.some((item) => item.emoji === reaction));

    return (
      <div
        key={row.id}
        className={`rounded-[18px] border border-black/[0.07] bg-white/84 p-4 ${depth > 0 ? "ml-6 mt-3" : ""}`}
        style={{ borderLeftWidth: 3, borderLeftColor: hexToRgba(color, 0.45) }}
      >
        <div className="flex items-start gap-3">
          <UserAvatar
            displayName={row.author?.display_name}
            avatarUrl={row.author?.avatar_url}
            userId={row.author?.id}
            memberColor={row.author?.member_color}
            className="h-9 w-9 shrink-0 text-xs"
            alt={`${row.author?.display_name ?? "Unknown"} avatar`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-text-primary">{row.author?.display_name || "Unknown"}</span>
              {row.author?.pronouns ? <span className="text-xs text-text-muted">{row.author.pronouns}</span> : null}
              <span className="text-xs text-text-muted">{formatDateTime(row.created_at)}</span>
            </div>
            {row.author?.status_message ? <p className="mt-1 text-xs text-text-muted">{row.author.status_message}</p> : null}
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{text || "(No content)"}</p>
            {row.is_edited ? <p className="mt-1 text-[11px] text-text-muted">Edited</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {knownReactions.map((reaction) => (
                <button
                  key={`${row.id}-${reaction.emoji}`}
                  type="button"
                  onClick={() => void toggleReaction(row.id, reaction.emoji)}
                  disabled={actionId === `reaction-${row.id}-${reaction.emoji}`}
                  className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                    reaction.reacted
                      ? "border-primary-300 bg-primary-50 text-primary-700"
                      : "border-black/10 bg-white text-text-secondary hover:bg-black/[0.04] hover:text-text-primary"
                  }`}
                >
                  {reaction.emoji} {reaction.count}
                </button>
              ))}
              {extraReactions.map((reaction) => (
                <button
                  key={`${row.id}-${reaction}`}
                  type="button"
                  onClick={() => void toggleReaction(row.id, reaction)}
                  disabled={actionId === `reaction-${row.id}-${reaction}`}
                  className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-xs text-text-secondary transition-colors hover:bg-black/[0.04] hover:text-text-primary"
                >
                  {reaction}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setReplyOpen((prev) => ({ ...prev, [row.id]: !prev[row.id] }))}
                className="ml-1 rounded-lg px-2 py-0.5 text-xs text-text-muted transition-colors hover:bg-black/[0.05] hover:text-text-primary"
              >
                Reply
              </button>
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => void removeComment(row.id)}
                  disabled={actionId === `delete-${row.id}`}
                  className="rounded-lg px-2 py-0.5 text-xs text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
                >
                  Delete
                </button>
              ) : null}
            </div>
            {replyOpen[row.id] ? (
              <div className="mt-3 flex gap-2">
                <input
                  value={replyDrafts[row.id] ?? ""}
                  onChange={(event) => setReplyDrafts((prev) => ({ ...prev, [row.id]: event.target.value }))}
                  className="input flex-1"
                  placeholder="Write a reply"
                />
                <button
                  type="button"
                  onClick={() => void submitComment(row.id)}
                  disabled={actionId === `reply-${row.id}`}
                  className="rounded-lg bg-primary-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
                >
                  {actionId === `reply-${row.id}` ? "Saving..." : "Reply"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {row.replies?.length > 0 ? <div className="mt-3">{row.replies.map((reply) => renderComment(reply, depth + 1))}</div> : null}
      </div>
    );
  };

  const reviewStats = [
    { label: "Decision", value: getPaperReviewDecisionLabel(reviewMeta.decision) },
    { label: "Venue", value: reviewMeta.venue || "Not set" },
    { label: "Year", value: reviewMeta.year || "Not set" },
    { label: "Rating", value: reviewMeta.rating || "Not set" },
  ];

  if (loading) {
    return <p className="py-20 text-center text-sm text-text-muted">Loading doc...</p>;
  }

  return (
    <div className="mx-auto max-w-[920px] space-y-5 py-6">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="bg-white/88 px-6 py-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-[10px] border px-2 py-1 text-[10px] font-medium ${isPaperReview ? "border-primary-200 bg-primary-50 text-primary-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                {isPaperReview ? "Paper review" : "Doc"}
              </span>
              {dateStr ? <span className="text-xs text-text-muted">{dateStr}</span> : null}
            </div>
            <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-text-primary md:text-[38px]">{displayTitle}</h1>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-text-secondary">
              {isPaperReview
                ? "Structured review for literature decisions. The summary cards keep the judgment scannable, and the body preserves the reasoning."
                : "Shared doc for reusable context, decisions, and reference material."}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              {authorName ? (
                <span className="inline-flex items-center gap-2 rounded-full px-2.5 py-1" style={{ backgroundColor: hexToRgba(authorColor, 0.12) }}>
                  <UserAvatar displayName={authorName} avatarUrl={authorAvatar} memberColor={authorColor} className="h-6 w-6 shrink-0 text-[10px]" alt={`${authorName} avatar`} />
                  <span className="text-sm font-medium" style={{ color: authorColor }}>{authorName}</span>
                </span>
              ) : null}
              {authorPronouns ? <span className="text-xs text-text-muted">{authorPronouns}</span> : null}
              {authorStatus ? <span className="text-xs text-text-muted">{authorStatus}</span> : null}
            </div>
          </div>
          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-3 lg:grid-cols-1">
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Mode</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{viewMode === "read" ? "Read" : "Edit"}</p>
              <p className="mt-1 text-sm text-text-secondary">Switch to edit only when the doc needs a durable update.</p>
            </div>
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Length</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{wordCount}</p>
              <p className="mt-1 text-sm text-text-secondary">{calcReadingTime(contentRef.current.text)} min read</p>
            </div>
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">{isPaperReview ? "Decision" : "Comments"}</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{isPaperReview ? getPaperReviewDecisionLabel(reviewMeta.decision) : comments.length}</p>
              <p className="mt-1 text-sm text-text-secondary">{isPaperReview ? "The team takeaway captured at the top of the review." : "Discussion stays attached to the doc."}</p>
            </div>
          </div>
        </div>
      </GlassCard>

      {canManagePost ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={() => setViewMode((mode) => (mode === "read" ? "edit" : "read"))} className="rounded-[12px] border border-black/10 bg-white/80 px-3.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-white hover:text-text-primary">
            {viewMode === "read" ? "Switch to edit" : "Back to read"}
          </button>
          <button type="button" onClick={onDelete} className="rounded-[12px] border border-red-200/80 bg-red-50 px-3.5 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100">
            Delete
          </button>
        </div>
      ) : null}

      {viewMode === "read" ? (
        <>
          {isPaperReview ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {reviewStats.map((stat) => (
                <GlassCard key={stat.label} className="workspace-stat p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">{stat.label}</p>
                  <p className="mt-3 text-lg font-semibold text-text-primary">{stat.value}</p>
                </GlassCard>
              ))}
              <GlassCard className="workspace-stat p-5 md:col-span-2 xl:col-span-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Source</p>
                {reviewMeta.link ? (
                  <a href={reviewMeta.link} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-medium text-primary-600 hover:underline">
                    Open paper
                  </a>
                ) : (
                  <p className="mt-3 text-sm text-text-secondary">No source link saved yet.</p>
                )}
              </GlassCard>
            </div>
          ) : null}

          <GlassCard className="space-y-4">
            <div className="border-b border-black/[0.08] pb-3">
              <h2 className="text-lg font-semibold text-text-primary">{isPaperReview ? "Review body" : "Document body"}</h2>
            </div>
            <RichTextEditor key={`read-${editorKey}`} initialContent={initialContent} readOnly />
          </GlassCard>
        </>
      ) : (
        <GlassCard>
          <form onSubmit={onSave} className="space-y-5">
            {isPaperReview ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-text-primary">Paper title</label>
                  <input className="input w-full" value={reviewMeta.paperTitle} onChange={(event) => setReviewMeta((prev) => normalizePaperReviewMeta({ ...prev, paperTitle: event.target.value }))} placeholder="Attention Is All You Need" />
                  <p className="mt-2 text-xs text-text-muted">Saved as `{buildPaperReviewTitle(reviewMeta.paperTitle)}`.</p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-primary">Venue</label>
                  <input className="input w-full" value={reviewMeta.venue} onChange={(event) => setReviewMeta((prev) => normalizePaperReviewMeta({ ...prev, venue: event.target.value }))} placeholder="NeurIPS" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-primary">Year</label>
                  <input className="input w-full" value={reviewMeta.year} onChange={(event) => setReviewMeta((prev) => normalizePaperReviewMeta({ ...prev, year: event.target.value }))} inputMode="numeric" placeholder="2025" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-primary">Decision</label>
                  <select className="input w-full" value={reviewMeta.decision} onChange={(event) => setReviewMeta((prev) => normalizePaperReviewMeta({ ...prev, decision: event.target.value as PaperReviewDecision | "" }))}>
                    <option value="">Not set</option>
                    {paperReviewDecisionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-primary">Rating</label>
                  <input className="input w-full" value={reviewMeta.rating} onChange={(event) => setReviewMeta((prev) => normalizePaperReviewMeta({ ...prev, rating: event.target.value }))} placeholder="4/5" />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-text-primary">Source link</label>
                  <input className="input w-full" type="url" value={reviewMeta.link} onChange={(event) => setReviewMeta((prev) => normalizePaperReviewMeta({ ...prev, link: event.target.value }))} placeholder="https://arxiv.org/abs/..." />
                </div>
              </div>
            ) : (
              <div>
                <label className="mb-2 block text-sm font-medium text-text-primary">Title</label>
                <input className="input w-full text-lg font-semibold" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Document title" />
              </div>
            )}
            <div className="workspace-inset px-4 py-4">
              <p className="text-sm font-medium text-text-primary">{isPaperReview ? "Review body" : "Document body"}</p>
              <p className="mt-1 text-sm text-text-secondary">{isPaperReview ? "Keep the body focused on reasoning, evidence, and the team takeaway. The metadata above is only for fast scanning." : "Write the version of the doc that someone else can read later without the original meeting context."}</p>
            </div>
            <div className="rounded-[20px] border border-black/[0.08] bg-white/70 p-4">
              <RichTextEditor key={`edit-${editorKey}`} initialContent={initialContent} onChange={handleEditorChange} placeholder={isPaperReview ? "Write the review body." : "Write the document body."} className="min-h-[420px]" />
            </div>
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>{wordCount} words - {calcReadingTime(contentRef.current.text)} min read</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setViewMode("read")} className="rounded-[12px] border border-black/10 px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-black/[0.05] hover:text-text-primary">Cancel</button>
                <button type="submit" disabled={saving} className="rounded-[12px] bg-primary-500 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-60">
                  {saving ? "Saving..." : isPaperReview ? "Save review" : "Save doc"}
                </button>
              </div>
            </div>
          </form>
        </GlassCard>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Discussion</h2>
          <button type="button" onClick={() => void loadComments()} className="rounded-[12px] border border-black/10 bg-white/70 px-2.5 py-1 text-xs text-text-secondary transition-colors hover:bg-white">
            Refresh
          </button>
        </div>
        <GlassCard className="space-y-3">
          <textarea className="input min-h-[96px] w-full resize-none" placeholder="Add context, challenge an assumption, or leave the next question for the team." value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} maxLength={800} />
          <div className="flex justify-end">
            <button type="button" onClick={() => void submitComment()} disabled={actionId === "comment-create" || !commentDraft.trim()} className="rounded-[12px] bg-primary-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-60">
              {actionId === "comment-create" ? "Saving..." : "Post comment"}
            </button>
          </div>
        </GlassCard>
        {commentsLoading ? (
          <p className="text-sm text-text-muted">Loading discussion...</p>
        ) : comments.length === 0 ? (
          <GlassCard>
            <p className="text-sm text-text-muted">No comments yet.</p>
          </GlassCard>
        ) : (
          <div className="space-y-3">{comments.map((row) => renderComment(row))}</div>
        )}
      </section>
    </div>
  );
}
