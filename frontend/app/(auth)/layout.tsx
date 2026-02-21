import type { ReactNode } from "react";
import { BackgroundBlobs } from "@/components/layout/BackgroundBlobs";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-base text-text-primary">
      <BackgroundBlobs />
      {children}
    </div>
  );
}
