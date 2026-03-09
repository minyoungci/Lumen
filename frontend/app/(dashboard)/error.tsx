"use client";
import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Dashboard Error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center px-6">
      <h2 className="text-xl font-semibold text-text-primary">페이지를 불러오지 못했습니다</h2>
      <p className="text-sm text-text-secondary max-w-md">{error.message}</p>
      <button
        onClick={reset}
        className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
      >
        다시 시도
      </button>
    </div>
  );
}
