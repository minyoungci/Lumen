"use client";

import Link from "next/link";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "@/store/sidebar";
import { useProjectStore } from "@/store/project";
import { ActivityFeed } from "./ActivityFeed";
import { PageTransition } from "./PageTransition";
import { Sidebar } from "./Sidebar";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const { isCollapsed, isActivityOpen } = useSidebarStore();
  const { currentProjectId, projects } = useProjectStore();
  const currentProject = projects.find((p) => p.id === currentProjectId);

  useEffect(() => {
    useSidebarStore.persist.rehydrate();
    useProjectStore.persist.rehydrate();
  }, []);

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
        <div className="mb-5 flex items-center gap-2 text-sm">
          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${currentProject ? "bg-primary-500" : "bg-gray-400"}`} />
          {currentProject ? (
            <>
              <span className="font-medium text-text-primary">{currentProject.name}</span>
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-600">
                {currentProject.role}
              </span>
            </>
          ) : (
            <span className="text-text-muted">Personal Space</span>
          )}
          <Link href="/projects" className="ml-auto text-xs text-text-muted hover:text-primary-500 transition-colors">
            Switch →
          </Link>
        </div>
        <PageTransition>{children}</PageTransition>
      </main>
      <ActivityFeed />
    </>
  );
}
