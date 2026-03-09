export interface SiteNavigationConfig {
  team_section_title: string;
  shared_group_label: string;
  shared_overview_label: string;
  shared_feed_label: string;
  shared_articles_label: string;
  schedule_label: string;
  graph_label: string;
}

export interface SiteHomeQuickActionsConfig {
  title: string;
  new_note_label: string;
  share_article_label: string;
  open_feed_label: string;
}

export interface SiteHomeConfig {
  quick_actions: SiteHomeQuickActionsConfig;
}

export interface SiteSharedOverviewConfig {
  title: string;
  description: string;
  articles_title: string;
  articles_description: string;
  feed_title: string;
  feed_description: string;
}

export interface SiteConfig {
  navigation: SiteNavigationConfig;
  home: SiteHomeConfig;
  shared_overview: SiteSharedOverviewConfig;
}

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  navigation: {
    team_section_title: "Team Space",
    shared_group_label: "Team Space",
    shared_overview_label: "Hub",
    shared_feed_label: "Updates",
    shared_articles_label: "Docs",
    schedule_label: "Schedule",
    graph_label: "Knowledge Graph",
  },
  home: {
    quick_actions: {
      title: "QUICK START",
      new_note_label: "New note",
      share_article_label: "New team doc",
      open_feed_label: "Open updates",
    },
  },
  shared_overview: {
    title: "Team Space",
    description: "Keep project updates, docs, and team context in one calm workspace.",
    articles_title: "Docs",
    articles_description: "Long-form decisions, protocols, and shared references for the team.",
    feed_title: "Updates",
    feed_description: "Fast signals, short insights, and in-progress observations from the project.",
  },
};

const MAX_LEN: Record<string, number> = {
  nav: 60,
  short: 80,
  desc: 160,
};

function safeText(value: unknown, fallback: string, maxLen: number): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
}

export function normalizeSiteConfig(raw: unknown): SiteConfig {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const nav = (source.navigation && typeof source.navigation === "object"
    ? source.navigation
    : {}) as Record<string, unknown>;
  const home = (source.home && typeof source.home === "object" ? source.home : {}) as Record<string, unknown>;
  const quickActions = (home.quick_actions && typeof home.quick_actions === "object"
    ? home.quick_actions
    : {}) as Record<string, unknown>;
  const shared = (source.shared_overview && typeof source.shared_overview === "object"
    ? source.shared_overview
    : {}) as Record<string, unknown>;

  return {
    navigation: {
      team_section_title: safeText(nav.team_section_title, DEFAULT_SITE_CONFIG.navigation.team_section_title, MAX_LEN.nav),
      shared_group_label: safeText(nav.shared_group_label, DEFAULT_SITE_CONFIG.navigation.shared_group_label, MAX_LEN.nav),
      shared_overview_label: safeText(nav.shared_overview_label, DEFAULT_SITE_CONFIG.navigation.shared_overview_label, MAX_LEN.nav),
      shared_feed_label: safeText(nav.shared_feed_label, DEFAULT_SITE_CONFIG.navigation.shared_feed_label, MAX_LEN.nav),
      shared_articles_label: safeText(nav.shared_articles_label, DEFAULT_SITE_CONFIG.navigation.shared_articles_label, MAX_LEN.nav),
      schedule_label: safeText(nav.schedule_label, DEFAULT_SITE_CONFIG.navigation.schedule_label, MAX_LEN.nav),
      graph_label: safeText(nav.graph_label, DEFAULT_SITE_CONFIG.navigation.graph_label, MAX_LEN.nav),
    },
    home: {
      quick_actions: {
        title: safeText(quickActions.title, DEFAULT_SITE_CONFIG.home.quick_actions.title, MAX_LEN.short),
        new_note_label: safeText(
          quickActions.new_note_label,
          DEFAULT_SITE_CONFIG.home.quick_actions.new_note_label,
          MAX_LEN.short
        ),
        share_article_label: safeText(
          quickActions.share_article_label,
          DEFAULT_SITE_CONFIG.home.quick_actions.share_article_label,
          MAX_LEN.short
        ),
        open_feed_label: safeText(
          quickActions.open_feed_label,
          DEFAULT_SITE_CONFIG.home.quick_actions.open_feed_label,
          MAX_LEN.short
        ),
      },
    },
    shared_overview: {
      title: safeText(shared.title, DEFAULT_SITE_CONFIG.shared_overview.title, MAX_LEN.short),
      description: safeText(shared.description, DEFAULT_SITE_CONFIG.shared_overview.description, MAX_LEN.desc),
      articles_title: safeText(shared.articles_title, DEFAULT_SITE_CONFIG.shared_overview.articles_title, MAX_LEN.short),
      articles_description: safeText(
        shared.articles_description,
        DEFAULT_SITE_CONFIG.shared_overview.articles_description,
        MAX_LEN.desc
      ),
      feed_title: safeText(shared.feed_title, DEFAULT_SITE_CONFIG.shared_overview.feed_title, MAX_LEN.short),
      feed_description: safeText(
        shared.feed_description,
        DEFAULT_SITE_CONFIG.shared_overview.feed_description,
        MAX_LEN.desc
      ),
    },
  };
}
