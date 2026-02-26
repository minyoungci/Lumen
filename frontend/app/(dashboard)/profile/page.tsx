"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/shared/GlassCard";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { avatarGradient, hexToRgba, resolveMemberColor } from "@/lib/memberColor";

type TabId = "edit" | "posts" | "logs";

interface MeRow {
  id: string;
  email?: string;
  display_name: string;
  avatar_url?: string;
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
  article: "Daily Log 공유",
  kanban: "인사이트",
  insight: "인사이트",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "임시저장",
  private: "개인보관",
  shared: "팀공유",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-amber-50 text-amber-600 border-amber-200/60",
  private: "bg-black/[0.04] text-text-muted border-black/10",
  shared: "bg-blue-50 text-blue-600 border-blue-200/60",
};

const BIO_MAX = 200;
const MAX_AVATAR_SIZE_BYTES = 40 * 1024 * 1024;

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

export default function ProfilePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("edit");
  const [me, setMe] = useState<MeRow | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit form state
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

  // Posts tab state
  const [posts, setPosts] = useState<SharedPostRow[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);

  // Logs tab state
  const [logs, setLogs] = useState<DailyLogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize tab from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "posts" || tab === "logs") setActiveTab(tab);
  }, []);

  // Load me data
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await api.get("/users/me");
        const row = res.data?.data;
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
        // network / server error — !me fallback UI handles display
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, []);

  // Load posts when tab = "posts"
  useEffect(() => {
    if (activeTab !== "posts") return;
    let mounted = true;
    setPostsLoading(true);
    const load = async () => {
      try {
        const res = await api.get("/shared-posts", { params: { mine: true, limit: 100 } });
        if (mounted) setPosts(res.data?.data ?? []);
      } finally {
        if (mounted) setPostsLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [activeTab]);

  // Load logs when tab = "logs"
  useEffect(() => {
    if (activeTab !== "logs") return;
    let mounted = true;
    setLogsLoading(true);
    const load = async () => {
      try {
        const res = await api.get("/daily-logs", { params: { limit: 100 } });
        if (mounted) setLogs(res.data?.data ?? []);
      } finally {
        if (mounted) setLogsLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [activeTab]);

  const handleAvatarUpload = async (file: File) => {
    setAvatarError(null);

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      setAvatarError("프로필 사진 용량이 너무 큽니다. 40MB 이하 파일만 업로드할 수 있습니다.");
      return;
    }

    setAvatarUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post("/users/me/avatar", form, { timeout: 180000 });
      const row: MeRow | null = res.data?.data ?? null;
      const url = row?.avatar_url ?? "";
      if (!row || !url) {
        setAvatarError("업로드는 완료됐지만 프로필 정보를 갱신하지 못했습니다.");
        return;
      }
      setMe(row);
      setAvatarUrl(url);
      const resolvedColor = resolveMemberColor(row.id, row.preferences?.member_color ?? row.member_color);
      setMemberColor(resolvedColor);
      setAccentColor(row.preferences?.accent_color || resolvedColor);
      setStatusMessage(row.preferences?.status_message || "");
      setPronouns(row.preferences?.pronouns || "");
      setBannerText(row.preferences?.banner_text || "");
    } catch (error) {
      const detail = extractErrorDetail(error);
      if (isPayloadTooLarge(error, detail)) {
        setAvatarError("프로필 사진 용량이 너무 큽니다. 40MB 이하로 줄여서 다시 업로드해주세요.");
        return;
      }
      setAvatarError(
        detail ? `프로필 사진 업로드 실패: ${detail}` : "프로필 사진 업로드에 실패했습니다."
      );
    } finally {
      setAvatarUploading(false);
    }
  };

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.patch("/users/me", {
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
      const row: MeRow | null = res.data?.data ?? null;
      if (row) {
        setMe(row);
        const resolvedColor = resolveMemberColor(row.id, row.preferences?.member_color ?? row.member_color);
        setMemberColor(resolvedColor);
        setAccentColor(row.preferences?.accent_color || resolvedColor);
        setStatusMessage(row.preferences?.status_message || "");
        setPronouns(row.preferences?.pronouns || "");
        setBannerText(row.preferences?.banner_text || "");
      }
    } finally {
      setSaving(false);
    }
  };

  const deletePost = async (id: string) => {
    await api.delete(`/shared-posts/${id}`);
    setPosts((prev) => prev.filter((p) => p.id !== id));
  };

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    router.replace(`/profile?tab=${tab}`, { scroll: false });
  };

  if (loading) return <p className="text-sm text-white/60">불러오는 중...</p>;
  if (!me) return <p className="text-sm text-white/60">프로필을 불러오지 못했습니다.</p>;

  const initials = me.display_name?.slice(0, 2).toUpperCase() || "?";
  const joinedDate = me.created_at
    ? new Date(me.created_at).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    : null;

  const TABS: { id: TabId; label: string }[] = [
    { id: "edit", label: "프로필 편집" },
    { id: "posts", label: "내 게시글" },
    { id: "logs", label: "내 Daily Log" },
  ];

  const stats = me.stats ?? { posts_count: 0, notes_count: 0, bookmarks_count: 0 };
  const resolvedMemberColor = resolveMemberColor(me.id, memberColor || me.member_color);
  const resolvedAccentColor = accentColor || resolvedMemberColor;
  const statusLine = statusMessage.trim() || "상태 메시지를 설정해보세요";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* ── Profile Card ── */}
      <GlassCard>
        <div
          className="mb-4 rounded-xl px-3 py-2 text-sm font-medium"
          style={{
            backgroundColor: hexToRgba(resolvedAccentColor, 0.16),
            color: resolvedAccentColor,
          }}
        >
          {bannerText.trim() || "내 프로필을 자유롭게 꾸며보세요"}
        </div>
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div
              className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full text-lg font-bold text-white"
              style={{ background: avatarGradient(resolvedMemberColor) }}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={me.display_name} className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-text-primary">{me.display_name}</h1>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  me.role === "admin"
                    ? "bg-purple-50 text-purple-600 border-purple-200/60"
                    : "bg-black/[0.04] text-text-muted border-black/10"
                }`}
              >
                {me.role === "admin" ? "Admin" : "Member"}
              </span>
            </div>
            {joinedDate && (
              <p className="mt-0.5 text-xs text-text-muted">가입일: {joinedDate}</p>
            )}
            <p className="mt-1 text-xs text-text-muted">
              {statusLine}
              {pronouns.trim() ? ` · ${pronouns.trim()}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: "게시글", value: stats.posts_count },
            { label: "노트", value: stats.notes_count },
            { label: "북마크", value: stats.bookmarks_count },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-xl border border-black/[0.06] bg-white/60 p-3 text-center"
            >
              <p className="text-2xl font-bold text-text-primary">{value}</p>
              <p className="mt-0.5 text-xs text-text-muted">{label}</p>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* ── Tabs ── */}
      <div className="flex gap-1 rounded-xl border border-black/[0.06] bg-white/60 p-1">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => handleTabChange(id)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === id
                ? "bg-white text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: 프로필 편집 ── */}
      {activeTab === "edit" && (
        <GlassCard>
          <form className="space-y-5" onSubmit={onSave}>
            {/* Avatar Upload */}
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full text-xl font-bold text-white transition-all focus:outline-none"
                style={{ background: avatarGradient(resolvedMemberColor) }}
              >
                {avatarUploading ? (
                  <span className="animate-spin text-lg">⟳</span>
                ) : avatarUrl ? (
                  <>
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 text-white text-xl">
                      📷
                    </span>
                  </>
                ) : (
                  <>
                    <span>{initials}</span>
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 text-white text-xl">
                      📷
                    </span>
                  </>
                )}
              </button>
              <p className="text-xs text-text-muted">클릭하여 프로필 사진 변경 (최대 40MB)</p>
              {avatarError && (
                <p className="text-center text-xs font-medium text-red-500">{avatarError}</p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleAvatarUpload(file);
                  e.target.value = "";
                }}
              />
            </div>

            {/* Display Name */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-muted">
                Display Name
              </label>
              <input
                className="input w-full"
                placeholder="이름을 입력하세요"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            {/* Bio */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-text-muted">Bio</label>
                <span
                  className={`text-xs ${
                    bio.length > BIO_MAX ? "text-red-500" : "text-text-muted"
                  }`}
                >
                  {bio.length} / {BIO_MAX}
                </span>
              </div>
              <textarea
                className="input min-h-[100px] w-full resize-none"
                placeholder="간단한 자기소개를 입력하세요"
                value={bio}
                maxLength={BIO_MAX}
                onChange={(e) => setBio(e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-muted">멤버 컬러</label>
                <input
                  type="color"
                  value={resolvedMemberColor}
                  onChange={(e) => setMemberColor(e.target.value)}
                  className="h-10 w-full cursor-pointer rounded-lg border border-black/10 bg-white/80 px-1"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-muted">Accent 컬러</label>
                <input
                  type="color"
                  value={resolvedAccentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-10 w-full cursor-pointer rounded-lg border border-black/10 bg-white/80 px-1"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-muted">상태 메시지</label>
              <input
                className="input w-full"
                value={statusMessage}
                maxLength={80}
                onChange={(e) => setStatusMessage(e.target.value)}
                placeholder="집중 모드, 회의중, 실험중 등"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-muted">Pronouns</label>
                <input
                  className="input w-full"
                  value={pronouns}
                  maxLength={40}
                  onChange={(e) => setPronouns(e.target.value)}
                  placeholder="she/her, he/him, they/them"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-muted">배너 문구</label>
                <input
                  className="input w-full"
                  value={bannerText}
                  maxLength={120}
                  onChange={(e) => setBannerText(e.target.value)}
                  placeholder="내 연구 한줄소개"
                />
              </div>
            </div>

            <button
              disabled={saving || avatarUploading}
              className="rounded-lg bg-primary-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </form>
        </GlassCard>
      )}

      {/* ── Tab: 내 게시글 ── */}
      {activeTab === "posts" && (
        <div className="space-y-3">
          {postsLoading ? (
            <ListSkeleton />
          ) : posts.length === 0 ? (
            <GlassCard>
              <p className="text-sm text-text-muted">아직 발행한 글이 없습니다.</p>
            </GlassCard>
          ) : (
            posts.map((post) => (
              <GlassCard key={post.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded-full border border-black/10 bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium text-text-muted">
                        {TYPE_LABEL[post.type] ?? post.type}
                      </span>
                      {post.updated_at && (
                        <span className="text-xs text-text-muted">
                          {new Date(post.updated_at).toLocaleDateString("ko-KR")}
                        </span>
                      )}
                    </div>
                    <p className="truncate font-medium text-text-primary">{post.title}</p>
                    {post.preview && (
                      <p className="mt-1 line-clamp-2 text-sm text-text-muted">{post.preview}</p>
                    )}
                  </div>
                  <button
                    onClick={() => void deletePost(post.id)}
                    className="shrink-0 rounded-lg border border-red-200/60 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
                  >
                    삭제
                  </button>
                </div>
              </GlassCard>
            ))
          )}
        </div>
      )}

      {/* ── Tab: 내 Daily Log ── */}
      {activeTab === "logs" && (
        <div className="space-y-3">
          {logsLoading ? (
            <ListSkeleton />
          ) : logs.length === 0 ? (
            <GlassCard>
              <p className="text-sm text-text-muted">저장된 로그가 없습니다.</p>
            </GlassCard>
          ) : (
            logs.map((log) => (
              <Link key={log.id} href={`/daily-log/${log.log_date}`}>
                <GlassCard variant="interactive">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-text-primary">
                        {log.title?.trim() || `${log.log_date} 연구 로그`}
                      </p>
                      <p className="mt-0.5 text-xs text-text-muted">{log.log_date}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {log.status && (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                            STATUS_COLOR[log.status] ?? STATUS_COLOR.draft
                          }`}
                        >
                          {STATUS_LABEL[log.status] ?? log.status}
                        </span>
                      )}
                      <span className="text-xs text-text-muted">{log.word_count} words</span>
                    </div>
                  </div>
                  {log.preview && (
                    <p className="mt-2 line-clamp-3 text-sm text-text-muted">{log.preview}</p>
                  )}
                </GlassCard>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
