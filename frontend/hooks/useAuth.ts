"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AuthUser, UserRole } from "@/lib/auth";

function toRole(value: unknown): UserRole {
  return value === "admin" ? "admin" : "member";
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const syncSession = async () => {
      const { data } = await supabase.auth.getSession();
      const sessionUser = data.session?.user;

      if (!mounted) return;

      if (!sessionUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      const role = toRole(sessionUser.user_metadata?.role ?? sessionUser.app_metadata?.role);
      setUser({
        id: sessionUser.id,
        email: sessionUser.email ?? "",
        role,
      });
      setLoading(false);
    };

    void syncSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user;
      if (!sessionUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      const role = toRole(sessionUser.user_metadata?.role ?? sessionUser.app_metadata?.role);
      setUser({
        id: sessionUser.id,
        email: sessionUser.email ?? "",
        role,
      });
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return useMemo(() => ({ user, loading }), [user, loading]);
}
