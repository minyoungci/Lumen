"use client";

import { cn } from "@/lib/utils";
import { useSidebarStore } from "@/store/sidebar";
import { ActivityFeed } from "./ActivityFeed";
import { PageTransition } from "./PageTransition";
import { Sidebar } from "./Sidebar";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const { isCollapsed, isActivityOpen } = useSidebarStore();

  return (
    <>
      <Sidebar />
      <main
        style={{ paddingTop: "120px" }}
        className={cn(
          "min-h-screen pb-8 px-4 md:px-6 transition-all duration-300 ease-in-out",
          !isCollapsed && "md:ml-60",
          isActivityOpen && "xl:mr-72"
        )}
      >
        <PageTransition>{children}</PageTransition>
      </main>
      <ActivityFeed />
    </>
  );
}
