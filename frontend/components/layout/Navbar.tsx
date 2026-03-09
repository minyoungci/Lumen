"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LumenLogo } from "@/components/brand/LumenLogo";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useChromeStore } from "@/store/chrome";
import { useSidebarStore } from "@/store/sidebar";
import { GlobalSearch } from "./GlobalSearch";

const CREATE_ACTIONS = [
  { href: "/daily-log", label: "Daily log", description: "Capture today's work before it gets lost." },
  { href: "/research-notes/new", label: "Research note", description: "Write a long-form note with retrieval assist." },
  { href: "/shared/new?type=article", label: "Team doc", description: "Share a structured document with the team." },
  { href: "/shared/new?type=kanban", label: "Quick update", description: "Post a short update to the team feed." },
] as const;

export function Navbar() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const { toggle, toggleCollapse, isCollapsed } = useSidebarStore();
  const { isImmersiveMode, isChromeVisible, showChrome } = useChromeStore();
  const createRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await api.get("/notifications", { params: { is_read: false, limit: 1 } });
        if (mounted) setUnread(res.data?.unread_count ?? 0);
      } catch {
        if (mounted) setUnread(0);
      }
    };

    void load();
    const interval = window.setInterval(load, 15000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!createOpen) return;

    const handleClick = (event: MouseEvent) => {
      if (createRef.current && !createRef.current.contains(event.target as Node)) {
        setCreateOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [createOpen]);

  const onLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <header
      onMouseEnter={() => {
        if (isImmersiveMode) {
          showChrome();
        }
      }}
      className={cn(
        "glass-navbar fixed left-0 top-0 z-50 w-full border-b border-black/[0.06] transition-transform duration-300 ease-out",
        isImmersiveMode && !isChromeVisible && "md:-translate-y-full"
      )}
    >
      <div className="mx-auto flex h-[68px] max-w-[1400px] items-center gap-3 px-4 md:px-6">
        <button
          onClick={toggle}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[12px] border border-black/[0.08] bg-white/80 text-text-secondary transition-colors hover:bg-white hover:text-text-primary md:hidden"
          aria-label="Open navigation"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <button
          onClick={toggleCollapse}
          className="hidden h-9 w-9 flex-shrink-0 items-center justify-center rounded-[12px] border border-black/[0.08] bg-white/80 text-text-secondary transition-colors hover:bg-white hover:text-text-primary md:flex"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.4" />
            <path d="M5 1v14" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>

        <Link href="/home" className="flex items-center gap-3 pr-2 text-text-primary">
          <LumenLogo size={26} />
          <div className="hidden min-w-0 sm:block">
            <p className="text-sm font-semibold">Lumen</p>
            <p className="text-[11px] text-text-muted">Research workspace</p>
          </div>
        </Link>

        <div className="hidden min-w-0 max-w-[460px] flex-1 lg:block">
          <GlobalSearch />
        </div>

        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <div className="relative" ref={createRef}>
            <button
              type="button"
              onClick={() => setCreateOpen((prev) => !prev)}
              className={cn(
                "inline-flex items-center gap-2 rounded-[12px] border border-black/[0.08] px-3.5 py-2 text-sm font-medium transition-colors",
                createOpen ? "bg-slate-900 text-white" : "bg-white/88 text-text-primary hover:bg-white"
              )}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-[7px] bg-primary-500 text-xs text-white">
                +
              </span>
              New
            </button>

            {createOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] z-[80] w-[300px] overflow-hidden rounded-[18px] border border-black/[0.08] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.10)]">
                <div className="border-b border-black/[0.06] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Quick start</p>
                  <p className="mt-1 text-sm text-text-secondary">Pick the format, then keep moving.</p>
                </div>
                <div className="p-2">
                  {CREATE_ACTIONS.map((action) => (
                    <button
                      key={action.href}
                      type="button"
                      onClick={() => {
                        setCreateOpen(false);
                        router.push(action.href);
                      }}
                      className="flex w-full flex-col rounded-[12px] px-3 py-2.5 text-left transition-colors hover:bg-black/[0.03]"
                    >
                      <span className="text-sm font-medium text-text-primary">{action.label}</span>
                      <span className="mt-0.5 text-xs text-text-muted">{action.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Link
            href="/notifications"
            className="relative flex h-10 w-10 items-center justify-center rounded-[12px] border border-black/[0.08] bg-white/84 text-text-secondary transition-colors hover:bg-white hover:text-text-primary"
            aria-label={unread > 0 ? `${unread} unread notifications` : "Open inbox"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M14.5 18a2.5 2.5 0 0 1-5 0M6 9a6 6 0 1 1 12 0v4.2l1.2 2.4c.3.6-.1 1.4-.8 1.4H5.6c-.7 0-1.1-.8-.8-1.4L6 13.2V9Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 text-[10px] font-medium leading-4 text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>

          <Link
            href="/profile"
            className="hidden rounded-[12px] border border-black/[0.08] bg-white/84 px-3.5 py-2 text-sm text-text-secondary transition-colors hover:bg-white hover:text-text-primary sm:inline-flex"
          >
            Profile
          </Link>

          <button
            onClick={onLogout}
            className="rounded-[12px] border border-black/[0.08] bg-white/84 px-3.5 py-2 text-sm text-text-secondary transition-colors hover:bg-white hover:text-text-primary"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
