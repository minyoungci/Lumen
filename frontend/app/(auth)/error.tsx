"use client";
import { useEffect } from "react";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Auth Error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center px-6">
      <h2 className="text-xl font-semibold">오류가 발생했습니다</h2>
      <p className="text-sm text-gray-500 max-w-md">{error.message}</p>
      <button
        onClick={reset}
        className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
      >
        다시 시도
      </button>
    </div>
  );
}
