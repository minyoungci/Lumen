"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { GlassCard } from "@/components/shared/GlassCard";
import { RichTextEditor, TiptapContent, textToTiptap } from "@/components/shared/RichTextEditor";
import { api } from "@/lib/api";
import { contentTone } from "@/lib/contentColor";
import { hexToRgba } from "@/lib/memberColor";

interface Column { id: string; name: string; color?: string | null; }
interface CurrentUserRow { id?: string; role?: "admin" | "member"; }

export default function SharedFeedDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [kanbanColumn, setKanbanColumn] = useState("");
  const [columns, setColumns] = useState<Column[]>([]);
  const [initialContent, setInitialContent] = useState<TiptapContent | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"read" | "edit">("read");
  const [postOwnerId, setPostOwnerId] = useState("");
  const [currentUser, setCurrentUser] = useState<CurrentUserRow>({});
  const contentRef = useRef<{ json: TiptapContent | null; text: string }>({ json: null, text: "" });
  const feedTone = contentTone("feed");

  useEffect(() => {
    let mounted = true;
    if (!id) return;
    const load = async () => {
      try {
        const [postRes, colRes, meRes] = await Promise.all([api.get(`/shared-posts/${id}`), api.get("/kanban/columns"), api.get("/users/me")]);
        if (!mounted) return;
        const row = postRes.data?.data;
        if (!row) return;
        const tiptap: TiptapContent = row.content?.tiptap ?? textToTiptap(typeof row.content?.text === "string" ? row.content.text : "");
        const text = typeof row.content?.text === "string" ? row.content.text : "";
        setTitle(row.title || "");
        setKanbanColumn(row.kanban_column ?? "");
        setInitialContent(tiptap);
        setEditorKey((key) => key + 1);
        contentRef.current = { json: tiptap, text };
        setColumns((colRes.data?.data ?? []) as Column[]);
        setPostOwnerId(typeof row.user_id === "string" ? row.user_id : "");
        const me = meRes.data?.data ?? meRes.data ?? {};
        setCurrentUser({ id: typeof me.id === "string" ? me.id : undefined, role: me.role === "admin" ? "admin" : "member" });
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [id]);

  const handleEditorChange = (json: TiptapContent, text: string) => {
    contentRef.current = { json, text };
  };

  const canManagePost = currentUser.role === "admin" || (Boolean(currentUser.id) && currentUser.id === postOwnerId);
  const activeColumnColor = columns.find((column) => column.name === kanbanColumn)?.color ?? feedTone.base;

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!id) return;
    if (!canManagePost) return window.alert("You do not have permission to edit this update.");
    setSaving(true);
    try {
      const { json, text } = contentRef.current;
      await api.patch(`/shared-posts/${id}`, { title, content: { text, tiptap: json }, kanban_column: kanbanColumn || null });
      setViewMode("read");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!id) return;
    if (!canManagePost) return window.alert("You do not have permission to delete this update.");
    if (!window.confirm("Delete this update?")) return;
    await api.delete(`/shared-posts/${id}`);
    router.push("/shared/feed");
  };

  if (loading) return <p className="text-sm text-text-muted">Loading update...</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="bg-white/88 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Update</p>
            <h1 className="mt-4 text-[28px] font-semibold tracking-[-0.04em] text-text-primary">{viewMode === "read" ? title || "Untitled update" : "Edit update"}</h1>
            <p className="mt-3 text-sm leading-7 text-text-secondary">Keep updates short. If the content needs more structure, move it into a doc instead.</p>
          </div>
          <div className="grid gap-[1px] bg-black/[0.06]">
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Mode</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{viewMode === "read" ? "Read" : "Edit"}</p>
            </div>
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Topic</p>
              <div className="mt-3">
                <span className="rounded-full border px-2 py-1 text-xs font-medium" style={{ backgroundColor: hexToRgba(activeColumnColor, 0.12), borderColor: hexToRgba(activeColumnColor, 0.4), color: activeColumnColor }}>{kanbanColumn ? `#${kanbanColumn}` : "No topic"}</span>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="flex items-center justify-end gap-2">
        {canManagePost ? (
          <>
            <button type="button" onClick={() => setViewMode((mode) => (mode === "read" ? "edit" : "read"))} className="rounded-lg border border-black/10 bg-white/80 px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-white hover:text-text-primary">
              {viewMode === "read" ? "Switch to edit" : "Switch to read"}
            </button>
            <button onClick={onDelete} className="rounded-lg border border-red-200/70 bg-red-50 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-100">
              Delete
            </button>
          </>
        ) : null}
      </div>

      <GlassCard>
        {viewMode === "read" ? (
          <article className="space-y-3">
            <div className="border-b border-black/[0.08] pb-3">
              <h2 className="text-xl font-semibold text-text-primary">{title || "Untitled update"}</h2>
            </div>
            <RichTextEditor key={`read-${editorKey}`} initialContent={initialContent} readOnly />
          </article>
        ) : (
          <form onSubmit={onSave} className="space-y-4">
            <input className="input w-full text-lg" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Headline" />
            <div>
              <label className="mb-1 block text-sm text-text-muted">Topic</label>
              <select className="input w-full" value={kanbanColumn} onChange={(event) => setKanbanColumn(event.target.value)}>
                <option value="">No topic</option>
                {columns.map((column) => <option key={column.id} value={column.name}>{column.name}</option>)}
              </select>
            </div>
            <div className="rounded-lg border border-black/10 bg-white/70 p-4">
              <RichTextEditor key={editorKey} initialContent={initialContent} onChange={handleEditorChange} placeholder="Write the update body." />
            </div>
            <div className="flex justify-end">
              <button disabled={saving} className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-60">
                {saving ? "Saving..." : "Save update"}
              </button>
            </div>
          </form>
        )}
      </GlassCard>
    </div>
  );
}
