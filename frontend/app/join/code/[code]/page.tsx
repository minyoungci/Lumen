"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LumenLogo } from "@/components/brand/LumenLogo";
import { GlassCard } from "@/components/shared/GlassCard";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

export default function JoinByCodePage({ params }: { params: { code: string } }) {
  const normalizedCode = useMemo(
    () => decodeURIComponent(params.code || "").trim().toUpperCase(),
    [params.code],
  );
  const { user, loading } = useAuth();
  const router = useRouter();

  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (user) {
      if (!normalizedCode) {
        setError("This invite code is not valid.");
        return;
      }

      setJoining(true);
      api
        .post("/projects/join/code", { code: normalizedCode })
        .then(() => {
          router.push("/home");
        })
        .catch((err) => {
          const status = err?.response?.status;
          const message = err?.response?.data?.detail ?? "This project could not be joined.";
          if (status === 409) {
            router.push("/home");
            return;
          }
          setError(message);
          setJoining(false);
        });
      return;
    }

    try {
      sessionStorage.setItem("pending_invite_code", normalizedCode);
    } catch {
      // Ignore storage failures and still allow auth redirect.
    }
  }, [loading, normalizedCode, router, user]);

  if (loading || joining) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(87,172,255,0.2),_transparent_45%),linear-gradient(180deg,_#f7fafc_0%,_#eef3f8_100%)] px-4">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-white/80 shadow-sm">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-black/15 border-t-primary-500" />
          </div>
          <p className="text-sm text-text-secondary">Checking your invite code...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(87,172,255,0.2),_transparent_45%),linear-gradient(180deg,_#f7fafc_0%,_#eef3f8_100%)] px-4">
        <GlassCard variant="elevated" className="w-full max-w-[420px] space-y-5 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600">
            !
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-text-primary">Invite unavailable</h1>
            <p className="text-sm text-text-secondary">{error}</p>
          </div>
          <Link
            href="/home"
            className="inline-flex rounded-full bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"
          >
            Go to workspace
          </Link>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(87,172,255,0.2),_transparent_45%),linear-gradient(180deg,_#f7fafc_0%,_#eef3f8_100%)] px-4">
      <GlassCard variant="elevated" className="w-full max-w-[460px] space-y-6">
        <div className="flex items-center gap-3">
          <LumenLogo size={28} />
          <div>
            <p className="text-sm font-semibold text-text-primary">Lumen</p>
            <p className="text-xs text-text-muted">Invite code</p>
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-text-primary">
            Join with a project code.
          </h1>
          <p className="text-sm leading-7 text-text-secondary">
            This code came from a project owner. Sign in or create an account and Lumen will continue the join flow
            automatically.
          </p>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-white/90 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Invite code</p>
          <p className="mt-3 font-mono text-[24px] tracking-[0.28em] text-text-primary">
            {normalizedCode || "INVALID"}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href={`/login?redirect=${encodeURIComponent(`/join/code/${normalizedCode}`)}`}
            className="inline-flex items-center justify-center rounded-full bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"
          >
            Sign in to continue
          </Link>
          <Link
            href={`/signup?redirect=${encodeURIComponent(`/join/code/${normalizedCode}`)}`}
            className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
          >
            Create account and join
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}
