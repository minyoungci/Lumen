"use client";

import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { api } from "@/lib/api";
import { normalizeSiteConfig, type SiteConfig } from "@/lib/siteConfig";
import { useSiteConfigStore } from "@/store/siteConfig";

interface SiteSettingsPayload {
  published_config?: unknown;
  draft_config?: unknown;
  has_unpublished_changes?: boolean;
  updated_at?: string | null;
  published_at?: string | null;
}

function formatDate(value?: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminSiteConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<SiteConfig>(normalizeSiteConfig({}));
  const [published, setPublished] = useState<SiteConfig>(normalizeSiteConfig({}));
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false);

  const setPreviewConfig = useSiteConfigStore((state) => state.setConfig);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get("/admin/site-settings");
      const data: SiteSettingsPayload = response.data?.data ?? {};
      const nextDraft = normalizeSiteConfig(data.draft_config ?? {});
      const nextPublished = normalizeSiteConfig(data.published_config ?? {});
      setDraft(nextDraft);
      setPublished(nextPublished);
      setHasUnpublishedChanges(Boolean(data.has_unpublished_changes));
      setUpdatedAt(data.updated_at ?? null);
      setPublishedAt(data.published_at ?? null);
    } catch {
      setError("Site configuration could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const statusText = useMemo(() => {
    if (hasUnpublishedChanges) return "Draft changes exist and are not live yet.";
    return "Draft matches the published version.";
  }, [hasUnpublishedChanges]);

  const setNavField = (key: keyof SiteConfig["navigation"], value: string) => {
    setDraft((current) => ({
      ...current,
      navigation: {
        ...current.navigation,
        [key]: value,
      },
    }));
  };

  const setHomeField = (key: keyof SiteConfig["home"]["quick_actions"], value: string) => {
    setDraft((current) => ({
      ...current,
      home: {
        ...current.home,
        quick_actions: {
          ...current.home.quick_actions,
          [key]: value,
        },
      },
    }));
  };

  const setSharedField = (key: keyof SiteConfig["shared_overview"], value: string) => {
    setDraft((current) => ({
      ...current,
      shared_overview: {
        ...current.shared_overview,
        [key]: value,
      },
    }));
  };

  const saveDraft = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await api.patch("/admin/site-settings/draft", {
        config: draft,
        mode: "replace",
      });
      const data: SiteSettingsPayload = response.data?.data ?? {};
      setDraft(normalizeSiteConfig(data.draft_config ?? draft));
      setPublished(normalizeSiteConfig(data.published_config ?? published));
      setHasUnpublishedChanges(Boolean(data.has_unpublished_changes));
      setUpdatedAt(data.updated_at ?? null);
      setPublishedAt(data.published_at ?? null);
      setMessage("Draft saved.");
    } catch {
      setError("Draft save failed.");
    } finally {
      setSaving(false);
    }
  };

  const applyPreview = () => {
    setPreviewConfig(draft);
    setMessage("Local preview now uses the current draft.");
    setError(null);
  };

  const resetPreview = () => {
    setPreviewConfig(published);
    setMessage("Local preview reverted to the published version.");
    setError(null);
  };

  const publish = async () => {
    setPublishing(true);
    setError(null);
    setMessage(null);
    try {
      const response = await api.post("/admin/site-settings/publish");
      const data: SiteSettingsPayload = response.data?.data ?? {};
      const nextPublished = normalizeSiteConfig(data.published_config ?? draft);
      const nextDraft = normalizeSiteConfig(data.draft_config ?? draft);
      setPublished(nextPublished);
      setDraft(nextDraft);
      setHasUnpublishedChanges(Boolean(data.has_unpublished_changes));
      setUpdatedAt(data.updated_at ?? null);
      setPublishedAt(data.published_at ?? null);
      setPreviewConfig(nextPublished);
      setMessage("Draft published.");
    } catch {
      setError("Publish failed.");
    } finally {
      setPublishing(false);
    }
  };

  const resetDraft = async () => {
    setResetting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await api.post("/admin/site-settings/reset-draft");
      const data: SiteSettingsPayload = response.data?.data ?? {};
      setDraft(normalizeSiteConfig(data.draft_config ?? published));
      setPublished(normalizeSiteConfig(data.published_config ?? published));
      setHasUnpublishedChanges(Boolean(data.has_unpublished_changes));
      setUpdatedAt(data.updated_at ?? null);
      setPublishedAt(data.published_at ?? null);
      setMessage("Draft reset to the published version.");
    } catch {
      setError("Draft reset failed.");
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-text-muted">Loading site configuration...</p>;
  }

  return (
    <div className="space-y-5">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="bg-white/88 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Site configuration</p>
            <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-text-primary md:text-[38px]">
              Change product language
              <br />
              without shipping code.
            </h1>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-text-secondary">
              Edit the labels that shape navigation, the home quick-start module, and the team space overview. Use draft
              mode to preview, then publish when the wording is ready for users.
            </p>
          </div>

          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-3 lg:grid-cols-1">
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Draft status</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">
                {hasUnpublishedChanges ? "Changed" : "Synced"}
              </p>
              <p className="mt-1 text-sm text-text-secondary">{statusText}</p>
            </div>
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Last edited</p>
              <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-text-primary">{formatDate(updatedAt)}</p>
            </div>
            <div className="bg-white/84 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Last published</p>
              <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-text-primary">{formatDate(publishedAt)}</p>
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={saveDraft}
            disabled={saving || publishing || resetting}
            className="rounded-full border border-black/10 bg-white px-3.5 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03] disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save draft"}
          </button>
          <button
            onClick={applyPreview}
            disabled={saving || publishing || resetting}
            className="rounded-full border border-black/10 bg-white px-3.5 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03] disabled:opacity-60"
          >
            Apply local preview
          </button>
          <button
            onClick={resetPreview}
            disabled={saving || publishing || resetting}
            className="rounded-full border border-black/10 bg-white px-3.5 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03] disabled:opacity-60"
          >
            Reset preview
          </button>
          <button
            onClick={resetDraft}
            disabled={saving || publishing || resetting}
            className="rounded-full border border-black/10 bg-white px-3.5 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03] disabled:opacity-60"
          >
            {resetting ? "Resetting..." : "Reset draft"}
          </button>
          <button
            onClick={publish}
            disabled={saving || publishing || resetting}
            className="rounded-full bg-primary-500 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
          >
            {publishing ? "Publishing..." : "Publish"}
          </button>
        </div>

        {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
      </GlassCard>

      <GlassCard className="space-y-4">
        <h2 className="text-sm font-semibold text-text-primary">Navigation</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-text-muted">Team section title</span>
            <input className="input w-full" value={draft.navigation.team_section_title} onChange={(event) => setNavField("team_section_title", event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-text-muted">Team group label</span>
            <input className="input w-full" value={draft.navigation.shared_group_label} onChange={(event) => setNavField("shared_group_label", event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-text-muted">Hub label</span>
            <input className="input w-full" value={draft.navigation.shared_overview_label} onChange={(event) => setNavField("shared_overview_label", event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-text-muted">Updates label</span>
            <input className="input w-full" value={draft.navigation.shared_feed_label} onChange={(event) => setNavField("shared_feed_label", event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-text-muted">Docs label</span>
            <input className="input w-full" value={draft.navigation.shared_articles_label} onChange={(event) => setNavField("shared_articles_label", event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-text-muted">Schedule label</span>
            <input className="input w-full" value={draft.navigation.schedule_label} onChange={(event) => setNavField("schedule_label", event.target.value)} />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-text-muted">Knowledge graph label</span>
            <input className="input w-full" value={draft.navigation.graph_label} onChange={(event) => setNavField("graph_label", event.target.value)} />
          </label>
        </div>
      </GlassCard>

      <GlassCard className="space-y-4">
        <h2 className="text-sm font-semibold text-text-primary">Home quick actions</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-text-muted">Section title</span>
            <input className="input w-full" value={draft.home.quick_actions.title} onChange={(event) => setHomeField("title", event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-text-muted">New note label</span>
            <input className="input w-full" value={draft.home.quick_actions.new_note_label} onChange={(event) => setHomeField("new_note_label", event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-text-muted">New doc label</span>
            <input className="input w-full" value={draft.home.quick_actions.share_article_label} onChange={(event) => setHomeField("share_article_label", event.target.value)} />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-text-muted">Open updates label</span>
            <input className="input w-full" value={draft.home.quick_actions.open_feed_label} onChange={(event) => setHomeField("open_feed_label", event.target.value)} />
          </label>
        </div>
      </GlassCard>

      <GlassCard className="space-y-4">
        <h2 className="text-sm font-semibold text-text-primary">Team space overview</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-text-muted">Page title</span>
            <input className="input w-full" value={draft.shared_overview.title} onChange={(event) => setSharedField("title", event.target.value)} />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-text-muted">Page description</span>
            <input className="input w-full" value={draft.shared_overview.description} onChange={(event) => setSharedField("description", event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-text-muted">Docs card title</span>
            <input className="input w-full" value={draft.shared_overview.articles_title} onChange={(event) => setSharedField("articles_title", event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-text-muted">Updates card title</span>
            <input className="input w-full" value={draft.shared_overview.feed_title} onChange={(event) => setSharedField("feed_title", event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-text-muted">Docs card description</span>
            <input className="input w-full" value={draft.shared_overview.articles_description} onChange={(event) => setSharedField("articles_description", event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-text-muted">Updates card description</span>
            <input className="input w-full" value={draft.shared_overview.feed_description} onChange={(event) => setSharedField("feed_description", event.target.value)} />
          </label>
        </div>
      </GlassCard>
    </div>
  );
}
