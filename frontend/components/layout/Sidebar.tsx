"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { LumenLogo } from "@/components/brand/LumenLogo";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useChromeStore } from "@/store/chrome";
import { useProjectStore } from "@/store/project";
import { useSidebarStore } from "@/store/sidebar";
import { useSiteConfigStore } from "@/store/siteConfig";

interface Project {
  id: string;
  name: string;
  description?: string | null;
  invite_token: string;
  role: "owner" | "member";
  my_role?: "owner" | "member";
  created_at: string;
}

function navItemClass(active: boolean, compact = false) {
  return cn(
    "group flex items-center gap-3 rounded-[14px] border px-3.5 py-2.5 text-[13px] transition-all duration-150",
    compact && "py-2",
    active
      ? "border-black/[0.08] bg-white text-text-primary shadow-[0_8px_24px_rgba(15,23,42,0.05)]"
      : "border-black/[0.04] text-text-secondary hover:border-black/[0.08] hover:bg-white/82 hover:text-text-primary"
  );
}

function NavDot({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "h-2.5 w-2.5 rounded-full transition-colors",
        active ? "bg-primary-500" : "bg-black/10 group-hover:bg-primary-300"
      )}
    />
  );
}

function ProjectDropdown({ onNavClick }: { onNavClick?: () => void }) {
  const router = useRouter();
  const { currentProjectId, projects, setCurrentProject, setProjects } = useProjectStore();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const safeProjects = Array.isArray(projects) ? projects : [];
  const currentProject = safeProjects.find((project) => project.id === currentProjectId) ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    api
      .get<{ data: Project[] }>("/projects")
      .then((res) => {
        if (cancelled) return;
        const normalized = (res.data.data ?? []).map((project) => ({
          ...project,
          role: project.my_role ?? project.role ?? "member",
        }));
        setProjects(normalized);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [setProjects]);

  useEffect(() => {
    if (!open) return;

    const handleClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const select = (id: string | null) => {
    setCurrentProject(id);
    setOpen(false);
    router.refresh();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full rounded-[18px] border border-black/[0.08] bg-white/92 p-4 text-left shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition-colors hover:bg-white"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Current workspace</p>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-text-primary">
              {currentProject?.name ?? "Personal space"}
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              {currentProject ? `${currentProject.role} access` : "Private notes, drafts, and experiments"}
            </p>
          </div>
          <svg
            className={cn("mt-1 h-4 w-4 flex-shrink-0 text-text-muted transition-transform", open && "rotate-180")}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="mt-3 inline-flex rounded-[10px] border border-black/[0.06] bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-text-secondary">
          {safeProjects.length} project{safeProjects.length === 1 ? "" : "s"}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 top-[calc(100%+10px)] z-50 overflow-hidden rounded-[18px] border border-black/[0.08] bg-white shadow-[0_20px_48px_rgba(15,23,42,0.12)]"
          >
            <div className="border-b border-black/[0.06] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Switch context</p>
            </div>

            <div className="max-h-[320px] overflow-y-auto p-2">
              <button
                type="button"
                onClick={() => select(null)}
                className={cn(navItemClass(currentProjectId === null, true), "w-full text-left")}
              >
                <NavDot active={currentProjectId === null} />
                <div className="min-w-0">
                  <p className="truncate font-medium">Personal space</p>
                  <p className="text-xs text-text-muted">Private writing and solo thinking</p>
                </div>
              </button>

              {safeProjects.length > 0 && (
                <div className="mt-1 space-y-1">
                  {loading ? (
                    <p className="px-3 py-2 text-xs text-text-muted">Loading projects...</p>
                  ) : (
                    safeProjects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => select(project.id)}
                        className={cn(navItemClass(currentProjectId === project.id, true), "w-full text-left")}
                      >
                        <NavDot active={currentProjectId === project.id} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{project.name}</p>
                          <p className="text-xs text-text-muted">{project.role}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-black/[0.06] p-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onNavClick?.();
                  router.push("/projects");
                }}
                className={cn(navItemClass(false, true), "w-full text-left")}
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-[8px] bg-primary-500 text-xs text-white">
                  +
                </span>
                <div>
                  <p className="font-medium text-text-primary">Manage projects</p>
                  <p className="text-xs text-text-muted">Create a project or invite the team</p>
                </div>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const siteConfig = useSiteConfigStore((state) => state.config);
  const [teamOpen, setTeamOpen] = useState(() => pathname.startsWith("/shared"));

  useEffect(() => {
    if (pathname.startsWith("/shared")) {
      setTeamOpen(true);
    }
  }, [pathname]);

  const isRouteActive = (href: string) => {
    if (href === "/shared") return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const linkItem = (href: string, label: string) => (
    <Link key={href} href={href} className={navItemClass(isRouteActive(href))} onClick={onNavClick}>
      <NavDot active={isRouteActive(href)} />
      <span>{label}</span>
    </Link>
  );

  return (
    <div className="flex h-full flex-col px-4 py-5">
      <ProjectDropdown onNavClick={onNavClick} />

      <div className="mt-6">
        <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Workspace</p>
        <nav className="mt-2 space-y-1">
          {linkItem("/home", "Overview")}
          {linkItem("/daily-log", "Journal")}
          {linkItem("/research-notes", "Notes")}
        </nav>
      </div>

      <div className="mt-6">
        <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
          {siteConfig.navigation.team_section_title}
        </p>
        <div className="mt-2 space-y-1">
          <button
            type="button"
            onClick={() => setTeamOpen((prev) => !prev)}
            className={navItemClass(pathname.startsWith("/shared"))}
            aria-expanded={teamOpen}
            aria-controls="team-subnav"
          >
            <NavDot active={pathname.startsWith("/shared")} />
            <span className="flex-1 text-left">{siteConfig.navigation.shared_group_label}</span>
            <svg
              className={cn("h-3.5 w-3.5 text-text-muted transition-transform", teamOpen && "rotate-180")}
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <AnimatePresence initial={false}>
            {teamOpen && (
              <motion.div
                id="team-subnav"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.16 }}
                className="overflow-hidden"
              >
                <div className="space-y-1 pl-2">
                  {linkItem("/shared", siteConfig.navigation.shared_overview_label)}
                  {linkItem("/shared/feed", siteConfig.navigation.shared_feed_label)}
                  {linkItem("/shared/articles", siteConfig.navigation.shared_articles_label)}
                  {linkItem("/shared/paper-reviews", "Paper Reviews")}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {linkItem("/projects", "Projects")}
          {linkItem("/graph", siteConfig.navigation.graph_label)}
        </div>
      </div>

      <div className="mt-6">
        <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Utilities</p>
        <nav className="mt-2 space-y-1">
          {linkItem("/notifications", "Inbox")}
          {linkItem("/schedule", siteConfig.navigation.schedule_label)}
          {linkItem("/settings", "Settings")}
          {linkItem("/pricing", "Billing")}
        </nav>
      </div>

      {user?.role === "admin" && (
        <div className="mt-6">
          <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Admin</p>
          <nav className="mt-2 space-y-1">
            {linkItem("/admin", "Dashboard")}
            {linkItem("/admin/users", "Users")}
            {linkItem("/admin/site-config", "Site Config")}
            {linkItem("/admin/ai-summary", "AI Summaries")}
          </nav>
        </div>
      )}

      <div className="mt-auto rounded-[18px] border border-black/[0.08] bg-white/82 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Fast move</p>
        <p className="mt-2 text-sm font-medium text-text-primary">Press Ctrl/Cmd + K</p>
        <p className="mt-1 text-xs text-text-secondary">
          Search notes, docs, feed updates, tags, and logs from one place.
        </p>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { isOpen, isCollapsed, close } = useSidebarStore();
  const { isImmersiveMode, isChromeVisible, showChrome } = useChromeStore();
  const desktopVisible = isImmersiveMode ? isChromeVisible : !isCollapsed;

  return (
    <>
      <motion.aside
        initial={false}
        animate={{
          width: desktopVisible ? 268 : 0,
          x: desktopVisible ? 0 : -20,
          opacity: desktopVisible ? 1 : 0.88,
        }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        onMouseEnter={() => {
          if (isImmersiveMode) {
            showChrome();
          }
        }}
        className={cn(
          "glass-sidebar fixed left-0 top-[68px] z-40 hidden h-[calc(100vh-68px)] overflow-hidden md:block",
          isImmersiveMode && !desktopVisible && "pointer-events-none"
        )}
      >
        <SidebarContent />
      </motion.aside>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
              onClick={close}
              aria-hidden="true"
            />

            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="glass-sidebar-mobile fixed left-0 top-0 z-50 h-full w-[280px] md:hidden"
            >
              <div className="flex h-[68px] items-center border-b border-black/[0.06] px-4">
                <div className="flex items-center gap-3">
                  <LumenLogo size={24} />
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Lumen</p>
                    <p className="text-[11px] text-text-muted">Research workspace</p>
                  </div>
                </div>
                <button
                  onClick={close}
                  className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-black/5 hover:text-text-primary"
                  aria-label="Close navigation"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M4 4l8 8M12 4 4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <SidebarContent onNavClick={close} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
