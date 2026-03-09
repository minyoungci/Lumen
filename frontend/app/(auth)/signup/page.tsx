"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LumenLogo } from "@/components/brand/LumenLogo";
import { GlassCard } from "@/components/shared/GlassCard";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect");
  const redirectTo = rawRedirect && rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") ? rawRedirect : null;

  const inviteCodeMatch = redirectTo?.match(/^\/join\/code\/([^/?#]+)/)?.[1] ?? null;
  const inviteCode = inviteCodeMatch ? decodeURIComponent(inviteCodeMatch).trim().toUpperCase() : null;
  const inviteToken = inviteCode ? null : redirectTo?.match(/^\/join\/([^/?#]+)/)?.[1] ?? null;
  const hasInvite = Boolean(inviteToken || inviteCode);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const bypassAuth = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!bypassAuth && !hasInvite) {
      setError("This signup flow is invite-only. Ask a workspace admin for an invite link or code.");
      return;
    }

    if (bypassAuth) {
      router.push(redirectTo || "/home");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/signup", {
        email: email.trim(),
        password,
        display_name: displayName || email.split("@")[0],
        invite_code: inviteCode ?? undefined,
        invite_token: inviteToken ?? undefined,
      });

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError("Account created, but automatic sign in failed. Please sign in manually.");
        return;
      }

      router.replace("/home");
    } catch (signupError) {
      const detail =
        (signupError as { response?: { data?: { detail?: string; message?: string } } })?.response?.data?.detail ??
        (signupError as { response?: { data?: { detail?: string; message?: string } } })?.response?.data?.message ??
        "Account creation failed.";
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  if (!bypassAuth && !hasInvite) {
    return (
      <GlassCard variant="elevated" className="w-full max-w-[440px] text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-white/80">
          <span className="text-lg text-text-primary">i</span>
        </div>
        <h1 className="mb-2 text-xl font-semibold text-text-primary">Invite-only access</h1>
        <p className="text-sm leading-7 text-text-secondary">
          New accounts are created from a project invite. Ask a workspace admin for an invite link or invite code, then
          return here to finish signup.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm font-medium text-primary-500 hover:underline">
          Go to sign in
        </Link>
      </GlassCard>
    );
  }

  return (
    <GlassCard variant="elevated" className="w-full max-w-[420px]">
      <div className="mb-6 flex flex-col gap-2">
        <LumenLogo size={32} />
        <h1 className="text-2xl font-semibold text-text-primary">Create account</h1>
        <p className="text-sm text-text-secondary">Set up your account and continue into the invited workspace.</p>
      </div>

      {hasInvite ? (
        <div className="mb-5 rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-700">
          {inviteCode ? `Invite code detected: ${inviteCode}` : "Invite link detected. Signup will continue into the workspace."}
        </div>
      ) : null}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Display name"
          className="input w-full"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <input
          type="email"
          placeholder="Email"
          className="input w-full"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          type="password"
          placeholder="Password (8+ characters)"
          className="input w-full"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <input
          type="password"
          placeholder="Confirm password"
          className="input w-full"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />

        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="h-10 rounded-lg bg-primary-500 font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
        >
          {bypassAuth ? "Enter (Dev Bypass)" : loading ? "Creating account..." : "Create account"}
        </button>

        {bypassAuth ? <p className="text-xs text-amber-500">Dev bypass mode is on.</p> : null}
      </form>

      <p className="mt-5 text-center text-sm text-text-secondary">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary-500 hover:underline">
          Sign in
        </Link>
      </p>
    </GlassCard>
  );
}

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(87,172,255,0.2),_transparent_45%),linear-gradient(180deg,_#f7fafc_0%,_#eef3f8_100%)] px-6">
      <Suspense
        fallback={<div className="h-10 w-10 animate-spin rounded-full border-2 border-black/15 border-t-primary-500" />}
      >
        <SignUpForm />
      </Suspense>
    </div>
  );
}
