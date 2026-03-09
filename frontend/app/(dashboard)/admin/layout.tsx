"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let mounted = true;

    const verify = async () => {
      try {
        const res = await api.get("/users/me");
        const role = res.data?.data?.role;
        if (!mounted) return;
        if (role === "admin") {
          setAllowed(true);
          setReady(true);
          return;
        }
        setAllowed(false);
        setReady(true);
        router.replace("/daily-log?denied=admin");
      } catch {
        if (!mounted) return;
        setAllowed(false);
        setReady(true);
        const redirect = pathname ? `?redirect=${encodeURIComponent(pathname)}` : "";
        router.replace(`/login${redirect}`);
      }
    };

    void verify();

    return () => {
      mounted = false;
    };
  }, [pathname, router]);

  if (!ready) {
    return <p className="text-sm text-text-muted">Checking admin access...</p>;
  }
  if (!allowed) {
    return null;
  }

  return <>{children}</>;
}
