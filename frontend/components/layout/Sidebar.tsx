"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSidebarStore } from "@/store/sidebar";
import { useProjectStore } from "@/store/project";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

function navItemClass(active: boolean) {
  return cn(
    "flex items-center gap-2 rounded-md px-3 py-1.5 text-[13.5px] transition-all duration-150",
    active
      ? "glass-nav-active text-text-primary font-medium"
      : "text-text-secondary hover:bg-white/40 hover:text-text-primary"
  );
}

interface Project {
  id: string;
  name: string;
  description?: string | null;
  invite_token: string;
  role: "owner" | "member";
  created_at: string;
}

function ProjectDropdown({ onNavClick }: { onNavClick?: () => void }) {
  const router = useRouter();
  const { currentProjectId, projects, setCurrentProject, setProjects } =
    useProjectStore();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentProject = projects.find((p) => p.id === currentProjectId);
  const label = currentProject ? currentProject.name : "Personal Space";

  // Fetch projects on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<Project[]>("/projects")
      .then((res) => {
        if (!cancelled) {
          setProjects(res.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setProjects]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const select = (id: string | null) => {
    setCurrentProject(id);
    setOpen(false);
  };

  return (
    <div className="relative mb-4" ref={dropdownRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-black/10 bg-white/40 px-3 py-2 text-[13px] font-medium text-text-primary hover:bg-white/60 transition-colors"
      >
        <span className="truncate">{label}</span>
        <svg
          className={cn(
            "ml-2 h-3.5 w-3.5 flex-shrink-0 text-text-muted transition-transform",
            open && "rotate-180"
          )}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-black/10 bg-white/90 shadow-lg backdrop-blur-md"
          >
            {/* Personal Space */}
            <button
              onClick={() => select(null)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-[13px] text-left hover:bg-black/5 transition-colors",
                currentProjectId === null
                  ? "font-medium text-text-primary"
                  : "text-text-secondary"
              )}
            >
              <span className="flex-1">Personal Space</span>
              {currentProjectId === null && (
                <svg className="h-3.5 w-3.5 text-primary-500" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>

            {projects.length > 0 && (
              <div className="border-t border-black/5">
                {loading ? (
                  <div className="px-3 py-2 text-xs text-text-muted">Loading…</div>
                ) : (
                  projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => select(p.id)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-[13px] text-left hover:bg-black/5 transition-colors",
                        currentProjectId === p.id
                          ? "font-medium text-text-primary"
                          : "text-text-secondary"
                      )}
                    >
                      <span className="flex-1 truncate">{p.name}</span>
                      {currentProjectId === p.id && (
                        <svg className="h-3.5 w-3.5 flex-shrink-0 text-primary-500" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}

            <div className="border-t border-black/5">
              <button
                onClick={() => {
                  setOpen(false);
                  onNavClick?.();
                  router.push("/projects");
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-text-secondary hover:bg-black/5 transition-colors"
              >
                <svg className="h-3.5 w-3.5 text-text-muted" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 2v8M2 6h8" strokeLinecap="round" />
                </svg>
                New Project
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

  const navItem = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      className={navItemClass(pathname === href)}
      onClick={onNavClick}
    >
      {label}
    </Link>
  );

  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      {/* Project switcher */}
      <ProjectDropdown onNavClick={onNavClick} />

      <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        Personal
      </div>
      <nav className="mt-2 space-y-0.5">
        {navItem("/daily-log", "Daily Log")}
        {navItem("/daily-log/archive", "Log Archive")}
        {navItem("/research-notes", "Research Notes")}
        {navItem("/profile", "Profile")}
      </nav>

      <div className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        Team
      </div>
      <nav className="mt-2 space-y-0.5">
        {navItem("/shared", "Shared Space")}
        {navItem("/shared/kanban", "Kanban")}
        {navItem("/schedule", "Schedule")}
        {navItem("/graph", "Knowledge Graph")}
      </nav>

      {user?.role === "admin" && (
        <>
          <div className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Admin
          </div>
          <nav className="mt-2 space-y-0.5">
            {navItem("/admin", "Dashboard")}
            {navItem("/admin/ai-summary", "AI Summaries")}
            {navItem("/admin/users", "Users")}
          </nav>
        </>
      )}

      <div className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        Settings
      </div>
      <nav className="mt-2 space-y-0.5">
        {navItem("/settings", "Settings")}
      </nav>
    </div>
  );
}

export function Sidebar() {
  const { isOpen, isCollapsed, close } = useSidebarStore();

  return (
    <>
      {/* Desktop sidebar — collapses with framer-motion */}
      <motion.aside
        animate={{ width: isCollapsed ? 0 : 240 }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="glass-sidebar fixed left-0 top-14 hidden h-[calc(100vh-56px)] overflow-hidden md:block"
      >
        <SidebarContent />
      </motion.aside>

      {/* Mobile overlay sidebar */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm md:hidden"
              onClick={close}
              aria-hidden="true"
            />

            {/* Drawer */}
            <motion.aside
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="glass-sidebar-mobile fixed left-0 top-0 z-50 h-full w-60 md:hidden"
            >
              {/* Drawer header */}
              <div className="flex h-14 items-center border-b border-black/[0.06] px-4">
                <div className="flex items-center gap-2">
                  <img src="/logo.png" alt="Lumen" className="h-7 w-auto object-contain" />
                </div>
                <button
                  onClick={close}
                  className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-black/5 hover:text-text-primary transition-colors"
                  aria-label="Close menu"
                >
                  ✕
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
