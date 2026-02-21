"use client";

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { api } from "@/lib/api";

interface Row {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  role: "admin" | "member";
  is_active: boolean;
}

export default function AdminUsersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await api.get("/users");
        if (mounted) setRows(res.data?.data ?? []);
      } catch {
        if (mounted) setRows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Admin Users</h1>
      {loading ? (
        <p className="text-sm text-white/60">불러오는 중...</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <GlassCard key={row.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium">{row.display_name}</p>
                <p className="text-xs text-white/50">{row.id}</p>
              </div>
              <div className="text-sm text-white/70">
                <span className="mr-3">{row.role}</span>
                <span>{row.is_active ? "active" : "inactive"}</span>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
