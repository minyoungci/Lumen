"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AuthUser, UserRole } from "@/lib/auth";

function toRole(value: unknown): UserRole {
  return value === "admin" ? "admin" : "member";
}

function readMetadataValue(source: unknown, field: "app_metadata" | "user_metadata"): unknown {
  if (!source || typeof source !== "object") return undefined;
  const value = (source as Record<string, unknown>)[field];
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>).role;
}

function readString(source: unknown, field: "id" | "email"): string | null {
  if (!source || typeof source !== "object") return null;
  const value = (source as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() ? value : null;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const syncFromSessionUser = (sessionUser: unknown) => {
      if (!mounted) return;
      const id = readString(sessionUser, "id");
      if (!id) {
        setUser(null);
        setLoading(false);
        return;
      }

      const role = toRole(
        readMetadataValue(sessionUser, "app_metadata") ?? readMetadataValue(sessionUser, "user_metadata"),
      );
      setUser({
        id,
        email: readString(sessionUser, "email") ?? "",
        role,
      });
      setLoading(false);
    };

    const syncSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        syncFromSessionUser(data.session?.user);
      } catch {
        syncFromSessionUser(null);
      }
    };

    void syncSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      syncFromSessionUser(session?.user);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return useMemo(() => ({ user, loading }), [user, loading]);
}
