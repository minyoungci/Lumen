"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useSidebarStore } from "@/store/sidebar";

export function Navbar() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const { toggle, toggleCollapse, isCollapsed } = useSidebarStore();

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

  const onLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <header className="glass-navbar fixed left-0 top-0 z-50 h-14 w-full">
      <div className="mx-auto flex h-full max-w-[1400px] items-center gap-3 px-4 md:px-6">
        {/* Hamburger — mobile only */}
        <button
          onClick={toggle}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-black/5 hover:text-text-primary transition-colors md:hidden"
          aria-label="Toggle menu"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        {/* Desktop sidebar collapse button */}
        <button
          onClick={toggleCollapse}
          className="hidden md:flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-black/5 hover:text-text-primary transition-colors"
          aria-label={isCollapsed ? "사이드바 열기" : "사이드바 닫기"}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 1v14" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2 text-text-primary">
          <div className="h-6 w-6 rounded bg-primary-500 flex-shrink-0" />
          <span className="font-semibold hidden sm:block">Lumen</span>
        </div>

        {/* Search */}
        <div className="hidden flex-1 max-w-[360px] lg:block">
          <input className="input h-9 w-full text-sm" placeholder="Search ⌘K (준비중)" readOnly />
        </div>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-3 text-text-secondary">
          <Link
            href="/notifications"
            className="relative hover:text-text-primary transition-colors"
            aria-label={unread > 0 ? `알림 ${unread}개 읽지 않음` : "알림"}
          >
            <span aria-hidden="true">🔔</span>
            {unread > 0 && (
              <span
                aria-hidden="true"
                className="absolute -right-2 -top-2 rounded-full bg-red-500 px-1.5 text-[10px] text-white leading-4"
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
          <Link
            href="/profile"
            className="text-sm hover:text-text-primary transition-colors"
          >
            Profile
          </Link>
          <button
            onClick={onLogout}
            className="rounded-lg border border-black/10 bg-white px-3 py-1 text-xs text-text-secondary shadow-sm hover:bg-black/5 hover:text-text-primary transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
