"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { GlassCard } from "@/components/shared/GlassCard";

export default function JoinPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const { user, loading } = useAuth();
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (user) {
      // User is logged in — attempt to join
      setJoining(true);
      api
        .post(`/projects/join/${token}`)
        .then(() => {
          router.push("/daily-log");
        })
        .catch((err) => {
          const msg =
            err?.response?.data?.detail ?? "Failed to join project.";
          // If already a member, just redirect
          if (
            err?.response?.status === 400 ||
            err?.response?.status === 409
          ) {
            router.push("/daily-log");
          } else {
            setError(msg);
            setJoining(false);
          }
        });
    } else {
      // Not logged in — save token for post-login use
      try {
        sessionStorage.setItem("pending_invite_token", token);
      } catch {}
    }
  }, [user, loading, token, router]);

  if (loading || joining) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <GlassCard className="max-w-sm w-full text-center" padding="lg">
          <p className="text-red-400 mb-4">{error}</p>
          <Link
            href="/daily-log"
            className="inline-block rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-600 transition-colors"
          >
            Go to Dashboard
          </Link>
        </GlassCard>
      </div>
    );
  }

  // Not logged in — show invite card
  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <GlassCard className="max-w-sm w-full text-center" padding="lg">
        <div className="mb-6">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-500/20">
            <svg
              className="h-6 w-6 text-primary-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white">
            You&apos;ve been invited to join a project
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            Sign in or create an account to accept this invitation.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Link
            href={`/login?redirect=/join/${token}`}
            className="rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-600 transition-colors"
          >
            Sign In
          </Link>
          <Link
            href={`/signup?redirect=/join/${token}`}
            className="rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/10 transition-colors"
          >
            Sign Up
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}
