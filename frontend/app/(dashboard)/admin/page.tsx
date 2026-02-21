"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/shared/GlassCard";
import { api } from "@/lib/api";

interface Stats {
  users: { total: number; active: number };
  content: {
    research_notes: number;
    shared_posts: number;
    kanban_cards: number;
    articles: number;
    comments: number;
    tags: number;
  };
  storage: { total_used_bytes: number; total_files: number };
  activity: { posts_this_week: number; comments_this_week: number; active_users_today: number };
}

function bytesToMB(v: number) {
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await api.get("/admin/stats");
        if (mounted) setStats(res.data?.data ?? null);
      } catch {
        if (mounted) setStats(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <p className="text-sm text-white/60">불러오는 중...</p>;
  if (!stats) return <p className="text-sm text-white/60">Admin 데이터를 불러오지 못했습니다.</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <div className="flex items-center gap-2">
          <Link href="/admin/users" className="rounded-lg border border-white/10 px-3 py-2 text-sm">Users</Link>
          <Link href="/admin/ai-summary" className="rounded-lg border border-white/10 px-3 py-2 text-sm">AI Summary</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GlassCard>
          <p className="text-xs text-white/60">Users</p>
          <p className="mt-2 text-2xl font-semibold">{stats.users.total}</p>
          <p className="text-xs text-white/50">active {stats.users.active}</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs text-white/60">Research Notes</p>
          <p className="mt-2 text-2xl font-semibold">{stats.content.research_notes}</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs text-white/60">Shared Posts</p>
          <p className="mt-2 text-2xl font-semibold">{stats.content.shared_posts}</p>
          <p className="text-xs text-white/50">article {stats.content.articles} · kanban {stats.content.kanban_cards}</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs text-white/60">Storage</p>
          <p className="mt-2 text-2xl font-semibold">{bytesToMB(stats.storage.total_used_bytes)}</p>
          <p className="text-xs text-white/50">files {stats.storage.total_files}</p>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GlassCard>
          <h2 className="text-base font-semibold">Content Activity</h2>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            <li>Comments: {stats.content.comments}</li>
            <li>Tags: {stats.content.tags}</li>
            <li>Posts this week: {stats.activity.posts_this_week}</li>
            <li>Comments this week: {stats.activity.comments_this_week}</li>
            <li>Active users today: {stats.activity.active_users_today}</li>
          </ul>
        </GlassCard>
      </div>
    </div>
  );
}
