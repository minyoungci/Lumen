"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useSidebarStore } from "@/store/sidebar";
import { cn } from "@/lib/utils";

function navItemClass(active: boolean) {
  return cn(
    "flex items-center gap-2 rounded-md px-3 py-1.5 text-[13.5px] transition-all duration-150",
    active
      ? "glass-nav-active text-text-primary font-medium"
      : "text-text-secondary hover:bg-white/40 hover:text-text-primary"
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
                  <div className="h-6 w-6 rounded bg-primary-500" />
                  <span className="font-semibold text-text-primary">LabBase</span>
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
