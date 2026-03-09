"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/shared/GlassCard";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { avatarGradient, hexToRgba, resolveMemberColor } from "@/lib/memberColor";

type TabId = "edit" | "posts" | "logs";

interface MeRow {
  id: string;
  email?: string;
  display_name: string;
  avatar_url?: string;
  cache_bust_version?: string;
  bio?: string;
  member_color?: string;
  preferences?: {
    status_message?: string;
    pronouns?: string;
    banner_text?: string;
    member_color?: string;
    accent_color?: string;
    profile_theme?: string;
  };
  role: "admin" | "member";
  created_at?: string;
  stats: {
    notes_count: number;
    posts_count: number;
    comments_count: number;
    bookmarks_count: number;
  };
}

interface SharedPostRow {
  id: string;
  type: string;
  title: string;
  preview?: string;
  updated_at?: string;
}

interface DailyLogRow {
  id: string;
  log_date: string;
  title?: string;
  word_count: number;
  preview: string;
  status?: string;
}

const TYPE_LABEL: Record<string, string> = {
  article: "Doc",
  kanban: "Update",
  insight: "Insight",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  private: "Private",
  shared: "Shared",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "border-amber-300/50 bg-amber-500/10 text-amber-700",
  private: "border-black/10 bg-white text-text-secondary",
  shared: "border-primary-300/50 bg-primary-500/10 text-primary-700",
};

const BIO_MAX = 200;
const MAX_AVATAR_SIZE_BYTES = 40 * 1024 * 1024;
const PROFILE_AVATAR_VERSION_MAP_KEY = "lumen-profile-avatar-version-map";

function isPayloadTooLarge(error: unknown, detail: string | null): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 413) return true;

  const message = (error as { message?: string })?.message ?? "";
  const normalized = `${detail ?? ""} ${message}`.toLowerCase();
  return (
    normalized.includes("413") ||
    normalized.includes("too large") ||
    normalized.includes("entity too large") ||
    normalized.includes("request body")
  );
}

function extractErrorDetail(error: unknown): string | null {
  const response = (error as { response?: { data?: unknown } })?.response;
  if (!response) return null;

  const data = response.data;
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (!trimmed) return null;
    return trimmed.length > 160 ? `${trimmed.slice(0, 160)}...` : trimmed;
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
    if (typeof record.message === "string") return record.message;
    if (Array.isArray(record.detail)) {
      const first = record.detail[0];
      if (first && typeof first === "object" && typeof (first as Record<string, unknown>).msg === "string") {
        return (first as Record<string, unknown>).msg as string;
      }
    }
  }

  return null;
}

function appendAvatarVersion(url: string, version?: string | null): string {
  if (!version) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(version)}`;
}

function syncProfileAvatarVersion(userId: string, version?: string | null) {
  if (typeof window === "undefined" || !userId) return;
  const resolvedVersion = version && version.trim() ? version : String(Date.now());
  try {
    const raw = localStorage.getItem(PROFILE_AVATAR_VERSION_MAP_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    parsed[userId] = resolvedVersion;
    localStorage.setItem(PROFILE_AVATAR_VERSION_MAP_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore local storage failures.
  }
  window.dispatchEvent(
    new CustomEvent("lumen:profile-avatar-updated", {
      detail: { userId, version: resolvedVersion },
    }),
  );
}

function resolvePostPath(post: SharedPostRow): string {
  if (post.type === "article") return `/shared/articles/${post.id}`;
  return `/shared/feed/${post.id}`;
}

function formatDate(value?: string): string {
  if (!value) return "Recently";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ProfilePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("edit");
  const [me, setMe] = useState<MeRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [memberColor, setMemberColor] = useState("#4f46e5");
  const [accentColor, setAccentColor] = useState("#4f46e5");
  const [statusMessage, setStatusMessage] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [bannerText, setBannerText] = useState("");
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [posts, setPosts] = useState<SharedPostRow[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);

  const [logs, setLogs] = useState<DailyLogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "posts" || tab === "logs") setActiveTab(tab);
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const response = await api.get("/users/me");
        const row = response.data?.data as MeRow | undefined;
        if (!mounted || !row) return;

        setMe(row);
        setDisplayName(row.display_name || "");
        setBio(row.bio || "");
        setAvatarUrl(row.avatar_url || "");
        const resolvedColor = resolveMemberColor(row.id, row.preferences?.member_color ?? row.member_color);
        setMemberColor(resolvedColor);
        setAccentColor(row.preferences?.accent_color || resolvedColor);
        setStatusMessage(row.preferences?.status_message || "");
        setPronouns(row.preferences?.pronouns || "");
        setBannerText(row.preferences?.banner_text || "");
      } catch {
        // Empty state handles failures.
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "posts") return;
    let mounted = true;
    setPostsLoading(true);

    void api
      .get("/shared-posts", { params: { mine: true, limit: 100 } })
      .then((response) => {
        if (mounted) setPosts(response.data?.data ?? []);
      })
      .finally(() => {
        if (mounted) setPostsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "logs") return;
    let mounted = true;
    setLogsLoading(true);

    void api
      .get("/daily-logs", { params: { limit: 100 } })
      .then((response) => {
        if (mounted) setLogs(response.data?.data ?? []);
      })
      .finally(() => {
        if (mounted) setLogsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [activeTab]);

  const handleAvatarUpload = async (file: File) => {
    setAvatarError(null);
    setSaveMessage(null);

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      setAvatarError("Avatar image is too large. Use a file under 40 MB.");
      return;
    }

    setAvatarUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await api.post("/users/me/avatar", form, { timeout: 180000 });
      const row: MeRow | null = response.data?.data ?? null;
      const url = row?.avatar_url ?? "";
      if (!row || !url) {
        setAvatarError("The upload completed, but the profile image could not be refreshed.");
        return;
      }

      setMe(row);
      setAvatarUrl(url);
      syncProfileAvatarVersion(row.id, row.cache_bust_version);
      const resolvedColor = resolveMemberColor(row.id, row.preferences?.member_color ?? row.member_color);
      setMemberColor(resolvedColor);
      setAccentColor(row.preferences?.accent_color || resolvedColor);
      setStatusMessage(row.preferences?.status_message || "");
      setPronouns(row.preferences?.pronouns || "");
      setBannerText(row.preferences?.banner_text || "");
      setSaveMessage("Avatar updated.");
    } catch (error) {
      const detail = extractErrorDetail(error);
      if (isPayloadTooLarge(error, detail)) {
        setAvatarError("Avatar image is too large. Reduce it below 40 MB and try again.");
        return;
      }
      setAvatarError(detail ? `Avatar upload failed: ${detail}` : "Avatar upload failed.");
    } finally {
      setAvatarUploading(false);
    }
  };

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaveMessage(null);

    try {
      const response = await api.patch("/users/me", {
        display_name: displayName,
        bio,
        avatar_url: avatarUrl || null,
        preferences: {
          status_message: statusMessage,
          pronouns,
          banner_text: bannerText,
          member_color: memberColor,
          accent_color: accentColor,
        },
      });

      const row: MeRow | null = response.data?.data ?? null;
      if (row) {
        setMe(row);
        syncProfileAvatarVersion(row.id, row.cache_bust_version);
        const resolvedColor = resolveMemberColor(row.id, row.preferences?.member_color ?? row.member_color);
        setMemberColor(resolvedColor);
        setAccentColor(row.preferences?.accent_color || resolvedColor);
        setStatusMessage(row.preferences?.status_message || "");
        setPronouns(row.preferences?.pronouns || "");
        setBannerText(row.preferences?.banner_text || "");
        setSaveMessage("Profile updated.");
      }
    } finally {
      setSaving(false);
    }
  };

  const deletePost = async (id: string) => {
    if (!window.confirm("Delete this post?")) return;
    await api.delete(`/shared-posts/${id}`);
    setPosts((current) => current.filter((row) => row.id !== id));
  };

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    router.replace(`/profile?tab=${tab}`, { scroll: false });
  };

  if (loading) {
    return <p className="text-sm text-text-muted">Loading profile...</p>;
  }

  if (!me) {
    return <p className="text-sm text-text-muted">The profile could not be loaded.</p>;
  }

  const joinedDate = me.created_at
    ? new Date(me.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const stats = me.stats ?? { notes_count: 0, posts_count: 0, comments_count: 0, bookmarks_count: 0 };
  const resolvedMemberColor = resolveMemberColor(me.id, memberColor || me.member_color);
  const resolvedAccentColor = accentColor || resolvedMemberColor;
  const statusLine = statusMessage.trim() || "Add a status so teammates know your current focus.";
  const bannerLine = bannerText.trim() || "Keep your profile card useful, brief, and recognizable.";
  const displayAvatarUrl = avatarUrl ? appendAvatarVersion(avatarUrl, me.cache_bust_version) : "";

  return (
    <div className="space-y-5">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="bg-white/88 px-6 py-6">
            <div
              className="inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
              style={{
                backgroundColor: hexToRgba(resolvedAccentColor, 0.16),
                color: resolvedAccentColor,
              }}
            >
              Profile
            </div>

            <div className="mt-5 flex items-start gap-4">
              <div
                className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full text-lg font-semibold text-white"
                style={{ background: avatarGradient(resolvedMemberColor) }}
              >
                {displayAvatarUrl ? (
                  <Image
                    src={displayAvatarUrl}
                    alt={me.display_name}
                    width={64}
                    height={64}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <UserAvatar
                    displayName={me.display_name}
                    userId={me.id}
                    memberColor={me.member_color}
                    className="h-full w-full text-base"
                  />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-[30px] font-semibold tracking-[-0.04em] text-text-primary md:text-[38px]">
                    {me.display_name}
                  </h1>
                  <span
                    className={`rounded-[10px] border px-2 py-0.5 text-[11px] font-medium ${
                      me.role === "admin"
                        ? "border-primary-300/50 bg-primary-500/10 text-primary-700"
                        : "border-black/10 bg-white text-text-secondary"
                    }`}
                  >
                    {me.role === "admin" ? "Admin" : "Member"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-text-secondary">{statusLine}</p>
                {me.bio ? <p className="mt-3 max-w-[620px] text-sm leading-7 text-text-secondary">{me.bio}</p> : null}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-text-muted">
              {joinedDate ? <span>Joined {joinedDate}</span> : null}
              {me.email ? <span>{me.email}</span> : null}
              {pronouns.trim() ? <span>{pronouns.trim()}</span> : null}
            </div>
          </div>

          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-2 lg:grid-cols-1">
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Contribution</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{stats.posts_count}</p>
              <p className="mt-1 text-sm text-text-secondary">Shared posts and docs published from this account.</p>
            </div>
            <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-3 lg:grid-cols-1">
              <div className="workspace-stat p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Notes</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{stats.notes_count}</p>
              </div>
              <div className="workspace-stat p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Comments</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{stats.comments_count}</p>
              </div>
              <div className="workspace-stat p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Bookmarks</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{stats.bookmarks_count}</p>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "edit" as const, label: "Profile settings" },
            { id: "posts" as const, label: "Published work" },
            { id: "logs" as const, label: "Journal history" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`rounded-[12px] border px-3.5 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-primary-500/40 bg-primary-500/10 text-primary-700"
                  : "border-black/10 bg-white text-text-secondary hover:bg-black/[0.03] hover:text-text-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </GlassCard>

      {activeTab === "edit" ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <GlassCard>
            <form className="space-y-5" onSubmit={onSave}>
              <div>
                <label className="mb-2 block text-sm font-medium text-text-primary">Avatar</label>
                <div className="workspace-inset flex items-center gap-4 p-4">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full text-xl font-bold text-white"
                    style={{ background: avatarGradient(resolvedMemberColor) }}
                  >
                    {avatarUploading ? (
                      <span className="text-sm">...</span>
                    ) : displayAvatarUrl ? (
                      <>
                        <Image src={displayAvatarUrl} alt="" width={80} height={80} className="h-full w-full object-cover" />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
                          Edit
                        </span>
                      </>
                    ) : (
                      <span>{me.display_name.slice(0, 2).toUpperCase()}</span>
                    )}
                  </button>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-text-primary">Update profile image</p>
                    <p className="text-xs text-text-muted">Use a square image when possible. Maximum file size is 40 MB.</p>
                    {avatarError ? <p className="text-xs font-medium text-red-500">{avatarError}</p> : null}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleAvatarUpload(file);
                      event.target.value = "";
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-text-primary">Display name</label>
                <input
                  className="input w-full"
                  placeholder="How your name appears in the workspace"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-text-primary">Bio</label>
                  <span className={`text-xs ${bio.length > BIO_MAX ? "text-red-500" : "text-text-muted"}`}>
                    {bio.length}/{BIO_MAX}
                  </span>
                </div>
                <textarea
                  className="input min-h-[120px] w-full resize-none"
                  placeholder="A short summary of what you work on."
                  value={bio}
                  maxLength={BIO_MAX}
                  onChange={(event) => setBio(event.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-primary">Member color</label>
                  <input
                    type="color"
                    value={resolvedMemberColor}
                    onChange={(event) => setMemberColor(event.target.value)}
                    className="h-11 w-full cursor-pointer rounded-xl border border-black/10 bg-white px-1"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-primary">Accent color</label>
                  <input
                    type="color"
                    value={resolvedAccentColor}
                    onChange={(event) => setAccentColor(event.target.value)}
                    className="h-11 w-full cursor-pointer rounded-xl border border-black/10 bg-white px-1"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-text-primary">Status message</label>
                <input
                  className="input w-full"
                  value={statusMessage}
                  maxLength={80}
                  onChange={(event) => setStatusMessage(event.target.value)}
                  placeholder="Deep work, in meetings, reviewing, or away"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-primary">Pronouns</label>
                  <input
                    className="input w-full"
                    value={pronouns}
                    maxLength={40}
                    onChange={(event) => setPronouns(event.target.value)}
                    placeholder="she/her, he/him, they/them"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-primary">Banner text</label>
                  <input
                    className="input w-full"
                    value={bannerText}
                    maxLength={120}
                    onChange={(event) => setBannerText(event.target.value)}
                    placeholder="Short line for your profile card"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-black/[0.06] pt-4">
                <div>
                  {saveMessage ? <p className="text-sm text-emerald-600">{saveMessage}</p> : null}
                </div>
                <button
                  disabled={saving || avatarUploading}
                  className="rounded-[12px] bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save profile"}
                </button>
              </div>
            </form>
          </GlassCard>

          <GlassCard className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Preview</p>
              <p className="mt-2 text-sm text-text-secondary">
                This is the identity card your teammates will recognize around the workspace.
              </p>
            </div>

            <div
              className="rounded-[20px] border border-black/[0.08] p-4"
              style={{
                background: `linear-gradient(135deg, ${hexToRgba(resolvedAccentColor, 0.14)}, ${hexToRgba(resolvedMemberColor, 0.08)})`,
              }}
            >
              <div
                className="rounded-[14px] px-3 py-2 text-sm font-medium"
                style={{
                  backgroundColor: hexToRgba(resolvedAccentColor, 0.18),
                  color: resolvedAccentColor,
                }}
              >
                {bannerLine}
              </div>

              <div className="mt-4 flex items-center gap-3 rounded-[16px] border border-white/70 bg-white/88 p-4 shadow-sm">
                <UserAvatar
                  displayName={displayName || me.display_name}
                  avatarUrl={avatarUrl || me.avatar_url}
                  userId={me.id}
                  memberColor={resolvedMemberColor}
                  className="h-11 w-11 text-sm"
                />
                <div className="min-w-0">
                  <p className="font-medium text-text-primary">{displayName || me.display_name}</p>
                  <p className="truncate text-xs text-text-muted">
                    {statusMessage.trim() || "Set a status to show your current focus."}
                    {pronouns.trim() ? ` | ${pronouns.trim()}` : ""}
                  </p>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      ) : null}

      {activeTab === "posts" ? (
        <div className="space-y-2">
          {postsLoading ? (
            <ListSkeleton />
          ) : posts.length === 0 ? (
            <GlassCard>
              <p className="text-sm font-medium text-text-primary">No published work yet.</p>
              <p className="mt-1 text-sm text-text-secondary">Create a doc or post an update to build your visible trail.</p>
            </GlassCard>
          ) : (
            posts.map((post) => (
              <GlassCard key={post.id}>
                <div className="workspace-row flex items-start justify-between gap-4 px-4 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-[10px] border border-black/10 bg-white px-2 py-0.5 text-[10px] font-medium text-text-muted">
                        {TYPE_LABEL[post.type] ?? post.type}
                      </span>
                      <span className="text-[11px] text-text-muted">{formatDate(post.updated_at)}</span>
                    </div>
                    <p className="mt-2 text-base font-semibold text-text-primary">{post.title}</p>
                    {post.preview ? <p className="mt-2 line-clamp-3 text-sm text-text-secondary">{post.preview}</p> : null}
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <Link
                      href={resolvePostPath(post)}
                      className="rounded-[10px] border border-black/10 bg-white px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
                    >
                      Open
                    </Link>
                    <button
                      onClick={() => void deletePost(post.id)}
                      className="rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </GlassCard>
            ))
          )}
        </div>
      ) : null}

      {activeTab === "logs" ? (
        <div className="space-y-2">
          {logsLoading ? (
            <ListSkeleton />
          ) : logs.length === 0 ? (
            <GlassCard>
              <p className="text-sm font-medium text-text-primary">No journal entries yet.</p>
              <p className="mt-1 text-sm text-text-secondary">Use the journal when you need a dated record of daily work.</p>
            </GlassCard>
          ) : (
            logs.map((log) => (
              <Link key={log.id} href={`/daily-log/${log.log_date}`}>
                <GlassCard variant="interactive">
                  <div className="workspace-row flex items-start justify-between gap-4 px-4 py-4">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-text-primary">
                        {log.title?.trim() || `Journal entry for ${log.log_date}`}
                      </p>
                      <p className="mt-1 text-xs text-text-muted">{log.log_date}</p>
                      {log.preview ? <p className="mt-2 line-clamp-3 text-sm text-text-secondary">{log.preview}</p> : null}
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-end gap-2">
                      {log.status ? (
                        <span
                          className={`rounded-[10px] border px-2 py-0.5 text-[10px] font-medium ${
                            STATUS_COLOR[log.status] ?? STATUS_COLOR.draft
                          }`}
                        >
                          {STATUS_LABEL[log.status] ?? log.status}
                        </span>
                      ) : null}
                      <span className="text-xs text-text-muted">{log.word_count} words</span>
                    </div>
                  </div>
                </GlassCard>
              </Link>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
