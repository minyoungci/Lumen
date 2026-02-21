import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface GlassCardProps {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg" | "none";
  variant?: "default" | "elevated" | "interactive" | "postit";
  glow?: boolean;
}

const paddingMap: Record<NonNullable<GlassCardProps["padding"]>, string> = {
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
  none: "p-0",
};

const variantMap: Record<NonNullable<GlassCardProps["variant"]>, string> = {
  // Liquid Glass — CSS classes defined in globals.css for reliable cross-browser rendering
  default:     "glass-default",
  elevated:    "glass-elevated",
  interactive: "glass-interactive",
  postit:      "rounded-xl border-0 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.06)]",
};

export function GlassCard({
  children,
  className,
  padding = "md",
  variant = "default",
  glow = false,
}: GlassCardProps) {
  return (
    <div
      className={cn(
        variantMap[variant],
        paddingMap[padding],
        glow &&
          "shadow-[0_0_20px_rgba(0,113,227,0.15),_0_0_60px_rgba(0,113,227,0.06)]",
        className
      )}
    >
      {children}
    </div>
  );
}
