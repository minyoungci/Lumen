import type { ReactNode } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { LayoutShell } from "@/components/layout/LayoutShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="relative min-h-screen text-text-primary">
        {/* Aurora background — fixed behind all content */}
        <div
          className="pointer-events-none fixed inset-0 overflow-hidden"
          style={{ zIndex: 0 }}
          aria-hidden="true"
        >
          {/* Base background */}
          <div className="absolute inset-0 bg-[#f5f5f7]" />
          {/* visionOS-style aurora blobs */}
          <div className="absolute -right-40 -top-40 h-[700px] w-[700px] rounded-full bg-blue-300 opacity-60 blur-[120px]" />
          <div className="absolute -left-40 top-1/3 h-[600px] w-[600px] rounded-full bg-violet-300 opacity-50 blur-[110px]" />
          <div className="absolute bottom-0 right-1/4 h-[500px] w-[500px] rounded-full bg-pink-300 opacity-45 blur-[100px]" />
          <div className="absolute left-1/2 top-2/3 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-emerald-200 opacity-40 blur-[90px]" />
        </div>

        {/* Content layer — sits above aurora */}
        <div className="relative" style={{ zIndex: 1 }}>
          <Navbar />
          <LayoutShell>{children}</LayoutShell>
        </div>
      </div>
    </ProtectedRoute>
  );
}
