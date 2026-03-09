import type { ReactNode } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { LayoutShell } from "@/components/layout/LayoutShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="relative min-h-screen text-text-primary">
        <div className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: 0 }} aria-hidden="true">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,#f4f6f8_0%,#eef2f6_48%,#f4f6f8_100%)]" />
          <div className="absolute inset-x-0 top-0 h-[280px] bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.14),transparent_62%)]" />
          <div
            className="absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                "linear-gradient(rgba(15,23,42,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.035) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
              maskImage: "linear-gradient(180deg, rgba(255,255,255,0.55), transparent 72%)",
            }}
          />
        </div>

        <div className="relative" style={{ zIndex: 1 }}>
          <Navbar />
          <LayoutShell>{children}</LayoutShell>
        </div>
      </div>
    </ProtectedRoute>
  );
}
