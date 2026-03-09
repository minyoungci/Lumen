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
    const redirectToLogin = () => {
      const fullPath = `${window.location.pathname || "/"}${window.location.search || ""}`;
      window.location.replace(`/login?redirect=${encodeURIComponent(fullPath)}`);
    };

    if (bypass) {
      setReady(true);
      return;
    }

    const applySession = (hasSession: boolean) => {
      if (hasSession) {
        setReady(true);
        return;
      }
      redirectToLogin();
    };

    const check = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        applySession(Boolean(data.session));
      } catch {
        redirectToLogin();
      }
    };
    void check();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setReady(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [bypass]);

  if (!ready) {
    return <div className="text-sm text-text-secondary">Loading...</div>;
  }

  return <>{children}</>;
}
