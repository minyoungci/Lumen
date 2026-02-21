"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [ready, setReady] = useState(false);

  const bypass = useMemo(
    () => process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true",
    []
  );

  useEffect(() => {
    if (bypass) {
      setReady(true);
      return;
    }

    const check = async () => {
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("supabase timeout")), 5000)
        );
        const { data } = await Promise.race([sessionPromise, timeoutPromise]);
        if (!data.session) {
          window.location.replace("/login");
          return;
        }
        setReady(true);
      } catch {
        window.location.replace("/login");
      }
    };
    void check();
  }, [bypass]);

  if (!ready) {
    return <div className="text-sm text-text-secondary">Loading...</div>;
  }

  return <>{children}</>;
}
