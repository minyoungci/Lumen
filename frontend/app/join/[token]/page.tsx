"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LumenLogo } from "@/components/brand/LumenLogo";
import { GlassCard } from "@/components/shared/GlassCard";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

export default function JoinPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const { user, loading } = useAuth();
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (user) {
      setJoining(true);
      api
        .post(`/projects/join/${token}`)
        .then(() => {
          router.push("/home");
        })
        .catch((err) => {
          const message = err?.response?.data?.detail ?? "This invite could not be accepted.";
          if (err?.response?.status === 400 || err?.response?.status === 409) {
            router.push("/home");
            return;
          }
          setError(message);
          setJoining(false);
        });
      return;
    }

    try {
      sessionStorage.setItem("pending_invite_token", token);
    } catch {
      // Ignore storage failures and still allow auth redirect.
    }
  }, [loading, router, token, user]);

  if (loading || joining) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(87,172,255,0.2),_transparent_45%),linear-gradient(180deg,_#f7fafc_0%,_#eef3f8_100%)] px-4">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-white/80 shadow-sm">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-black/15 border-t-primary-500" />
          </div>
          <p className="text-sm text-text-secondary">Checking your invitation...</p>
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
            <p className="text-xs text-text-muted">Project invitation</p>
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-text-primary">
            Join the project workspace.
          </h1>
          <p className="text-sm leading-7 text-text-secondary">
            This invite will connect your account to a team project. Sign in if you already have access, or create an
            account first and the invite will continue automatically.
          </p>
        </div>

        <div className="rounded-2xl border border-black/[0.06] bg-black/[0.03] p-4 text-sm text-text-secondary">
          After you sign in, Lumen will try to accept the invite immediately and send you to the workspace home.
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href={`/login?redirect=/join/${token}`}
            className="inline-flex items-center justify-center rounded-full bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"
          >
            Sign in to continue
          </Link>
          <Link
            href={`/signup?redirect=/join/${token}`}
            className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
          >
            Create account and join
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}
