"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { api } from "@/lib/api";

interface MeRow {
  id: string;
  email?: string;
  role: "admin" | "member";
  created_at?: string;
  storage_used?: number;
  preferences?: Preferences;
}

interface Preferences {
  autosave_interval?: "30" | "60" | "off";
  date_format?: "iso" | "us" | "ko";
  notify_comments?: boolean;
  notify_likes?: boolean;
}

const AUTOSAVE_OPTIONS: { value: NonNullable<Preferences["autosave_interval"]>; label: string }[] = [
  { value: "30", label: "30초" },
  { value: "60", label: "60초" },
  { value: "off", label: "끄기" },
];

const DATE_FORMAT_OPTIONS: { value: NonNullable<Preferences["date_format"]>; label: string }[] = [
  { value: "iso", label: "YYYY-MM-DD" },
  { value: "us", label: "MM/DD/YYYY" },
  { value: "ko", label: "한국식 (YYYY년 M월 D일)" },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function SettingsPage() {
  const [me, setMe] = useState<MeRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<Preferences>({
    autosave_interval: "30",
    date_format: "iso",
    notify_comments: true,
    notify_likes: true,
  });
  const [exporting, setExporting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("/users/me");
        const row: MeRow = res.data?.data;
        if (row) {
          setMe(row);
          setPrefs((prev) => ({ ...prev, ...(row.preferences ?? {}) }));
        }
      } catch {
        // network error — gracefully show empty state
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const patchPrefs = useCallback((updated: Preferences) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void api.patch("/users/me", { preferences: updated });
    }, 500);
  }, []);

  const updatePref = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    patchPrefs(updated);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get("/daily-logs", { params: { limit: 1000 } });
      const logs = res.data?.data ?? [];
      const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `daily-logs-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const joinedDate = me?.created_at
    ? new Date(me.created_at).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="mb-6">
        <h1 className="mb-1 text-2xl font-semibold text-text-primary">Settings</h1>
        <p className="text-sm text-text-muted">계정 및 앱 환경을 설정합니다.</p>
      </div>

      {/* ── 계정 정보 ── */}
      <GlassCard className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-text-primary">계정 정보</h2>
        <div className="divide-y divide-black/[0.05] rounded-xl border border-black/[0.06] bg-white/50">
          {[
            { label: "이메일", value: loading ? "..." : (me?.email ?? "—") },
            {
              label: "역할",
              value: loading ? "..." : (me?.role === "admin" ? "Admin" : "Member"),
            },
            { label: "가입일", value: loading ? "..." : (joinedDate ?? "—") },
            {
              label: "스토리지 사용량",
              value: loading
                ? "..."
                : me?.storage_used != null
                ? formatBytes(me.storage_used)
                : "—",
            },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-text-muted">{label}</span>
              <span className="text-sm font-medium text-text-primary">{value}</span>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* ── 앱 환경설정 ── */}
      <GlassCard className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-text-primary">앱 환경설정</h2>
        <div className="space-y-4">
          {/* 자동저장 */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">에디터 자동저장</p>
              <p className="text-xs text-text-muted">Daily Log 작성 중 자동 임시저장 주기</p>
            </div>
            <select
              value={prefs.autosave_interval ?? "30"}
              onChange={(e) =>
                updatePref(
                  "autosave_interval",
                  e.target.value as Preferences["autosave_interval"],
                )
              }
              className="rounded-lg border border-black/10 bg-white/80 px-3 py-1.5 text-sm text-text-primary outline-none transition-colors hover:bg-white focus:ring-2 focus:ring-primary-500/30"
            >
              {AUTOSAVE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t border-black/[0.05]" />

          {/* 날짜 표시 */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">날짜 표시 형식</p>
              <p className="text-xs text-text-muted">전체 UI에서 날짜를 표시하는 방식</p>
            </div>
            <select
              value={prefs.date_format ?? "iso"}
              onChange={(e) =>
                updatePref("date_format", e.target.value as Preferences["date_format"])
              }
              className="rounded-lg border border-black/10 bg-white/80 px-3 py-1.5 text-sm text-text-primary outline-none transition-colors hover:bg-white focus:ring-2 focus:ring-primary-500/30"
            >
              {DATE_FORMAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </GlassCard>

      {/* ── 알림 설정 ── */}
      <GlassCard className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-text-primary">알림 설정</h2>
        <div className="space-y-4">
          {(
            [
              {
                key: "notify_comments" as const,
                label: "댓글 알림",
                desc: "내 게시글에 댓글이 달리면 알림",
              },
              {
                key: "notify_likes" as const,
                label: "좋아요 알림",
                desc: "내 게시글에 좋아요가 달리면 알림",
              },
            ] as const
          ).map(({ key, label, desc }, i) => (
            <div key={key}>
              {i > 0 && <div className="mb-4 border-t border-black/[0.05]" />}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">{label}</p>
                  <p className="text-xs text-text-muted">{desc}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={prefs[key] ?? true}
                  onClick={() => updatePref(key, !(prefs[key] ?? true))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/40 ${
                    (prefs[key] ?? true)
                      ? "bg-primary-500"
                      : "bg-black/20"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      (prefs[key] ?? true) ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* ── 데이터 ── */}
      <GlassCard className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-text-primary">데이터</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">Daily Log 내보내기</p>
            <p className="text-xs text-text-muted">전체 로그를 JSON 파일로 다운로드합니다.</p>
          </div>
          <button
            onClick={() => void handleExport()}
            disabled={exporting}
            className="rounded-lg border border-black/10 bg-white/80 px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-white disabled:opacity-50"
          >
            {exporting ? "내보내는 중..." : "JSON 내보내기"}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}
