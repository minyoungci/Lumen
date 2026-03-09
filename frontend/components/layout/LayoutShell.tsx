"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { isImmersiveRoute } from "@/lib/immersiveRoutes";
import { cn } from "@/lib/utils";
import { useChromeStore } from "@/store/chrome";
import { useProjectStore } from "@/store/project";
import { useSidebarStore } from "@/store/sidebar";
import { useSiteConfigStore } from "@/store/siteConfig";
import { ActivityFeed } from "./ActivityFeed";
import { PageTransition } from "./PageTransition";
import { Sidebar } from "./Sidebar";

interface ProjectSummary {
  id: string;
  name: string;
  description?: string | null;
  invite_token: string;
  role: "owner" | "member";
  created_at: string;
}

const CONTEXT_LINKS = [
  { href: "/daily-log", label: "Journal" },
  { href: "/research-notes", label: "Notes" },
  { href: "/shared", label: "Team Space" },
  { href: "/notifications", label: "Inbox" },
];

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isCollapsed, isActivityOpen } = useSidebarStore();
  const { currentProjectId, projects, setProjects, setCurrentProject } = useProjectStore();
  const { setConfig: setSiteConfig, setLoaded: setSiteConfigLoaded } = useSiteConfigStore();
  const { isImmersiveMode, isChromeVisible, setImmersiveMode, showChrome, hideChrome, toggleChrome } = useChromeStore();
  const currentProject = projects.find((project) => project.id === currentProjectId) ?? null;
  const immersiveRoute = isImmersiveRoute(pathname);

  useEffect(() => {
    useSidebarStore.persist.rehydrate();
    useProjectStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncProjects = async () => {
      try {
        const res = await api.get<{ data?: Array<Record<string, unknown>> }>("/projects");
        const raw = res.data?.data ?? [];
        if (cancelled) return;

        const normalized: ProjectSummary[] = raw.map((project) => ({
          id: project.id as string,
          name: project.name as string,
          description: (project.description as string | null) ?? null,
          invite_token: project.invite_token as string,
          role: ((project.my_role ?? project.role) as "owner" | "member") ?? "member",
          created_at: project.created_at as string,
        }));

        setProjects(normalized);

        const activeProjectId = useProjectStore.getState().currentProjectId;
        if (activeProjectId && !normalized.some((project) => project.id === activeProjectId)) {
          setCurrentProject(null);
        }
      } catch {
        // Keep local state as-is on transient failures.
      }
    };

    void syncProjects();
    return () => {
      cancelled = true;
    };
  }, [setCurrentProject, setProjects]);

  useEffect(() => {
    let cancelled = false;

    const loadSiteConfig = async () => {
      try {
        const res = await api.get("/site-settings");
        if (cancelled) return;
        setSiteConfig(res.data?.data?.config ?? {});
      } catch {
        if (cancelled) return;
        setSiteConfig({});
      } finally {
        if (!cancelled) setSiteConfigLoaded(true);
      }
    };

    void loadSiteConfig();

    return () => {
      cancelled = true;
    };
  }, [setSiteConfig, setSiteConfigLoaded]);

  useEffect(() => {
    setImmersiveMode(immersiveRoute);
    if (immersiveRoute) {
      hideChrome();
      return;
    }
    hideChrome();
  }, [hideChrome, immersiveRoute, pathname, setImmersiveMode]);

  useEffect(() => {
    if (!isImmersiveMode) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hideChrome();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hideChrome, isImmersiveMode]);

  const reserveSidebar = !isImmersiveMode && !isCollapsed;
  const reserveActivity = !isImmersiveMode && isActivityOpen;

  return (
    <>
      {isImmersiveMode && (
        <>
          <div
            className="fixed inset-x-0 top-0 z-[60] hidden h-5 md:block"
            onMouseEnter={showChrome}
            aria-hidden="true"
          />
          <div
            className="fixed left-0 top-0 z-[60] hidden h-screen w-5 md:block"
            onMouseEnter={showChrome}
            aria-hidden="true"
          />
          <div
            className="fixed right-0 top-0 z-[60] hidden h-screen w-5 xl:block"
            onMouseEnter={showChrome}
            aria-hidden="true"
          />
          {!isChromeVisible && (
            <button
              type="button"
              onClick={toggleChrome}
              className="fixed left-4 top-4 z-[61] hidden items-center gap-2 rounded-full border border-black/10 bg-white/92 px-3 py-2 text-xs font-medium text-text-primary shadow-[0_10px_30px_rgba(15,23,42,0.12)] backdrop-blur md:inline-flex"
            >
              <span className="inline-flex h-2 w-2 rounded-full bg-primary-500" />
              Menu
            </button>
          )}
        </>
      )}
      <Sidebar />
      <main
        onMouseDown={() => {
          if (isImmersiveMode && isChromeVisible) {
            hideChrome();
          }
        }}
        className={cn(
          "min-h-screen px-4 pb-10 transition-all duration-300 ease-in-out md:px-6",
          isImmersiveMode ? "pt-[92px] md:pt-6" : "pt-[92px]",
          reserveSidebar && "md:ml-[268px]",
          reserveActivity && "xl:mr-72"
        )}
      >
        <div className="mx-auto w-full max-w-[1240px]">
          {!isImmersiveMode && (
            <div className="mb-5 rounded-[28px] border border-black/[0.07] bg-white/82 px-4 py-4 shadow-[0_16px_50px_rgba(15,23,42,0.05)] backdrop-blur-[18px] md:px-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Workspace focus</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", currentProject ? "bg-primary-500" : "bg-black/20")} />
                    <span className="truncate text-base font-semibold text-text-primary">
                      {currentProject ? currentProject.name : "Personal space"}
                    </span>
                    <span className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                      {currentProject ? currentProject.role : "private"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-text-secondary">
                    {currentProject?.description?.trim()
                      ? currentProject.description
                      : currentProject
                        ? "A focused project space for docs, updates, and collaboration."
                        : "Capture notes, explore ideas, and share when the work is ready."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {CONTEXT_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-black/[0.03] hover:text-text-primary"
                    >
                      {link.label}
                    </Link>
                  ))}
                  <Link
                    href="/projects"
                    className="rounded-full bg-primary-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-600"
                  >
                    Switch project
                  </Link>
                </div>
              </div>
            </div>
          )}

          <PageTransition>{children}</PageTransition>
        </div>
      </main>
      <ActivityFeed />
    </>
  );
}
