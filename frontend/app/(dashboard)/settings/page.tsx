"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { api } from "@/lib/api";
import { avatarGradient, hexToRgba, resolveMemberColor } from "@/lib/memberColor";

interface Preferences {
  autosave_interval?: "30" | "60" | "off";
  date_format?: "iso" | "us" | "ko";
  notify_comments?: boolean;
  notify_likes?: boolean;
  notify_reactions?: boolean;
  notify_replies?: boolean;
  notify_mentions?: boolean;
  profile_theme?: "aurora" | "sunset" | "forest" | "mono" | "ocean";
  member_color?: string;
  accent_color?: string;
  status_message?: string;
  pronouns?: string;
  banner_text?: string;
}

interface MeRow {
  id: string;
  email?: string;
  role: "admin" | "member";
  created_at?: string;
  storage_used?: number;
  display_name?: string;
  avatar_url?: string | null;
  member_color?: string | null;
  preferences?: Preferences;
}

const AUTOSAVE_OPTIONS: { value: NonNullable<Preferences["autosave_interval"]>; label: string }[] = [
  { value: "30", label: "Every 30 sec" },
  { value: "60", label: "Every 60 sec" },
  { value: "off", label: "Off" },
];

const DATE_FORMAT_OPTIONS: { value: NonNullable<Preferences["date_format"]>; label: string }[] = [
  { value: "iso", label: "YYYY-MM-DD" },
  { value: "us", label: "MM/DD/YYYY" },
  { value: "ko", label: "YYYY M D" },
];

const THEME_OPTIONS: { value: NonNullable<Preferences["profile_theme"]>; label: string }[] = [
  { value: "aurora", label: "Aurora" },
  { value: "sunset", label: "Sunset" },
  { value: "forest", label: "Forest" },
  { value: "mono", label: "Mono" },
  { value: "ocean", label: "Ocean" },
];

const NOTIFICATION_TOGGLES = [
  {
    key: "notify_comments" as const,
    label: "Comments",
    description: "Alert me when someone comments on my work.",
  },
  {
    key: "notify_replies" as const,
    label: "Replies",
    description: "Alert me when someone replies in a thread I am part of.",
  },
  {
    key: "notify_reactions" as const,
    label: "Reactions",
    description: "Alert me when someone reacts to my posts or comments.",
  },
  {
    key: "notify_mentions" as const,
    label: "Mentions",
    description: "Alert me when someone mentions me directly.",
  },
  {
    key: "notify_likes" as const,
    label: "Likes",
    description: "Keep the preference ready for lightweight appreciation signals.",
  },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const defaultPrefs: Preferences = {
  autosave_interval: "30",
  date_format: "iso",
  notify_comments: true,
  notify_likes: true,
  notify_reactions: true,
  notify_replies: true,
  notify_mentions: true,
  profile_theme: "aurora",
};

export default function SettingsPage() {
  const [me, setMe] = useState<MeRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<Preferences>(defaultPrefs);
  const [exporting, setExporting] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [meResponse, prefsResponse] = await Promise.all([
          api.get("/users/me"),
          api.get("/users/me/preferences").catch(() => ({ data: { data: { preferences: {} } } })),
        ]);

        const row = meResponse.data?.data as MeRow | undefined;
        const prefPayload = (prefsResponse.data?.data?.preferences ?? {}) as Preferences;

        if (row) {
          setMe(row);
          setPrefs((current) => ({ ...current, ...(row.preferences ?? {}), ...prefPayload }));
        }
      } catch {
        // Keep the page usable with defaults when network calls fail.
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const patchPrefs = useCallback((updated: Preferences) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveState("saving");

    debounceRef.current = setTimeout(() => {
      void api
        .patch("/users/me/preferences", { preferences: updated })
        .then((response) => {
          const payload = (response.data?.data?.preferences ?? {}) as Preferences;
          setPrefs((current) => ({ ...current, ...payload }));
          setSaveState("saved");
        })
        .catch(() => {
          setSaveState("error");
        });
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
      const response = await api.get("/daily-logs", { params: { limit: 1000 } });
      const logs = response.data?.data ?? [];
      const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `daily-logs-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const joinedDate = me?.created_at
    ? new Date(me.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Not available";

  const memberColor = resolveMemberColor(me?.id, prefs.member_color ?? me?.member_color);
  const accentColor = prefs.accent_color ?? memberColor;
  const bannerText = prefs.banner_text?.trim() || "Keep the workspace readable for everyone.";
  const statusMessage = prefs.status_message?.trim() || "Set a status so teammates know your current focus.";
  const pronouns = prefs.pronouns?.trim();
  const displayName = me?.display_name || "Member";

  return (
    <div className="space-y-5">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="bg-white/88 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Settings</p>
            <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-text-primary md:text-[38px]">
              Keep the workspace calm,
              <br />
              predictable, and yours.
            </h1>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-text-secondary">
              Defaults matter in a collaboration tool. Set how the workspace saves, formats dates, alerts you, and
              presents your identity so the app stays out of the way of the work.
            </p>
          </div>

          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-3 lg:grid-cols-1">
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Account</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">
                {loading ? "..." : displayName}
              </p>
              <p className="mt-1 text-sm text-text-secondary">{loading ? "Loading profile..." : me?.email ?? "No email"}</p>
            </div>
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Storage</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">
                {loading ? "..." : me?.storage_used != null ? formatBytes(me.storage_used) : "Not tracked"}
              </p>
              <p className="mt-1 text-sm text-text-secondary">Current uploaded content and file usage.</p>
            </div>
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Sync state</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">
                {saveState === "saving" ? "Saving" : saveState === "saved" ? "Saved" : saveState === "error" ? "Retry" : "Ready"}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                Preferences save automatically after you change them.
              </p>
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Account</h2>
          <p className="mt-1 text-sm text-text-secondary">Basic identity and membership information.</p>
        </div>
        <div className="divide-y divide-black/[0.05] rounded-2xl border border-black/[0.06] bg-white/60">
          {[
            { label: "Email", value: loading ? "..." : me?.email ?? "Not available" },
            { label: "Role", value: loading ? "..." : me?.role === "admin" ? "Admin" : "Member" },
            { label: "Joined", value: loading ? "..." : joinedDate },
            {
              label: "Storage used",
              value: loading ? "..." : me?.storage_used != null ? formatBytes(me.storage_used) : "Not tracked",
            },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-sm text-text-muted">{row.label}</span>
              <span className="text-sm font-medium text-text-primary">{row.value}</span>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Workspace defaults</h2>
          <p className="mt-1 text-sm text-text-secondary">Control how the app saves and formats the work you see every day.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">Journal autosave</label>
            <select
              value={prefs.autosave_interval ?? "30"}
              onChange={(event) =>
                updatePref("autosave_interval", event.target.value as Preferences["autosave_interval"])
              }
              className="input w-full"
            >
              {AUTOSAVE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-text-muted">Used in daily journal editing so short work is not lost.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">Date format</label>
            <select
              value={prefs.date_format ?? "iso"}
              onChange={(event) => updatePref("date_format", event.target.value as Preferences["date_format"])}
              className="input w-full"
            >
              {DATE_FORMAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-text-muted">Applies to the way dates are presented across the interface.</p>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Inbox and alerts</h2>
          <p className="mt-1 text-sm text-text-secondary">Keep only the collaboration signals that matter.</p>
        </div>

        <div className="space-y-4">
          {NOTIFICATION_TOGGLES.map((toggle, index) => (
            <div key={toggle.key}>
              {index > 0 ? <div className="mb-4 border-t border-black/[0.05]" /> : null}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-text-primary">{toggle.label}</p>
                  <p className="text-xs text-text-muted">{toggle.description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs[toggle.key] ?? true}
                  onClick={() => updatePref(toggle.key, !(prefs[toggle.key] ?? true))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/40 ${
                    prefs[toggle.key] ?? true ? "bg-primary-500" : "bg-black/20"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      prefs[toggle.key] ?? true ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Profile card</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Tune the small identity details teammates see around the workspace.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-text-primary">Member color</label>
                <input
                  type="color"
                  value={prefs.member_color ?? memberColor}
                  onChange={(event) => updatePref("member_color", event.target.value)}
                  className="h-11 w-full cursor-pointer rounded-xl border border-black/10 bg-white px-1"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-text-primary">Accent color</label>
                <input
                  type="color"
                  value={prefs.accent_color ?? accentColor}
                  onChange={(event) => updatePref("accent_color", event.target.value)}
                  className="h-11 w-full cursor-pointer rounded-xl border border-black/10 bg-white px-1"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-text-primary">Profile theme</label>
              <select
                value={prefs.profile_theme ?? "aurora"}
                onChange={(event) =>
                  updatePref("profile_theme", event.target.value as Preferences["profile_theme"])
                }
                className="input w-full"
              >
                {THEME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-text-primary">Status message</label>
              <input
                className="input w-full"
                maxLength={80}
                value={prefs.status_message ?? ""}
                onChange={(event) => updatePref("status_message", event.target.value)}
                placeholder="Deep work, in meetings, reviewing, or away"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-text-primary">Pronouns</label>
                <input
                  className="input w-full"
                  maxLength={40}
                  value={prefs.pronouns ?? ""}
                  onChange={(event) => updatePref("pronouns", event.target.value)}
                  placeholder="she/her, he/him, they/them"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-text-primary">Banner text</label>
                <input
                  className="input w-full"
                  maxLength={120}
                  value={prefs.banner_text ?? ""}
                  onChange={(event) => updatePref("banner_text", event.target.value)}
                  placeholder="Short line that frames your profile card"
                />
              </div>
            </div>
          </div>

          <div
            className="rounded-[28px] border border-black/[0.08] p-4"
            style={{
              background: `linear-gradient(135deg, ${hexToRgba(accentColor, 0.2)}, ${hexToRgba(memberColor, 0.12)})`,
            }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Preview</p>
            <div className="mt-3 rounded-2xl border border-white/70 bg-white/84 p-4 shadow-sm">
              <div
                className="rounded-2xl px-3 py-2 text-sm font-medium"
                style={{
                  backgroundColor: hexToRgba(accentColor, 0.18),
                  color: accentColor,
                }}
              >
                {bannerText}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{ background: avatarGradient(memberColor) }}
                >
                  {displayName.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-text-primary">{displayName}</p>
                  <p className="truncate text-xs text-text-muted">
                    {statusMessage}
                    {pronouns ? ` | ${pronouns}` : ""}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Data export</h2>
          <p className="mt-1 text-sm text-text-secondary">Download your journal history as JSON for backup or migration.</p>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-black/[0.06] bg-white/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">Daily logs</p>
            <p className="mt-1 text-xs text-text-muted">Exports up to 1000 entries from the daily log archive.</p>
          </div>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03] disabled:opacity-50"
          >
            {exporting ? "Preparing export..." : "Export JSON"}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}
