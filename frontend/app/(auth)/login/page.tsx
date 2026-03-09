"use client";

import type { FormEvent } from "react";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LumenLogo } from "@/components/brand/LumenLogo";
import { GlassCard } from "@/components/shared/GlassCard";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";

type InvitePath =
  | { kind: "code"; value: string }
  | { kind: "token"; value: string };

function parseInvitePath(path: string | null): InvitePath | null {
  if (!path) return null;

  const codeMatch = path.match(/^\/join\/code\/([^/?#]+)/);
  if (codeMatch?.[1]) {
    return { kind: "code", value: decodeURIComponent(codeMatch[1]).trim().toUpperCase() };
  }

  const tokenMatch = path.match(/^\/join\/([^/?#]+)/);
  if (tokenMatch?.[1]) {
    return { kind: "token", value: decodeURIComponent(tokenMatch[1]).trim() };
  }

  return null;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect");
  const redirectTo = rawRedirect && rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") ? rawRedirect : null;
  const inviteTarget = parseInvitePath(redirectTo);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bypassAuth = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";

  const consumePendingInvitePath = (): string | null => {
    try {
      const token = sessionStorage.getItem("pending_invite_token");
      if (token) {
        sessionStorage.removeItem("pending_invite_token");
        return `/join/${token}`;
      }

      const code = sessionStorage.getItem("pending_invite_code");
      if (code) {
        sessionStorage.removeItem("pending_invite_code");
        return `/join/code/${code}`;
      }

      return null;
    } catch {
      return null;
    }
  };

  const navigateTo = (path: string) => {
    if (typeof window !== "undefined") {
      window.location.assign(path);
      return;
    }
    router.push(path);
  };

  const joinInviteIfNeeded = async (path: string | null, accessToken?: string) => {
    const parsed = parseInvitePath(path);
    if (!parsed) return { handled: false as const, error: null as string | null };

    try {
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
      if (parsed.kind === "code") {
        await api.post("/projects/join/code", { code: parsed.value }, headers ? { headers } : undefined);
      } else {
        await api.post(
          `/projects/join/${encodeURIComponent(parsed.value)}`,
          undefined,
          headers ? { headers } : undefined,
        );
      }
      return { handled: true as const, error: null as string | null };
    } catch (joinError) {
      const status = (joinError as { response?: { status?: number } })?.response?.status;
      if (status === 409 || status === 400) {
        return { handled: true as const, error: null as string | null };
      }

      const detail =
        (joinError as { response?: { data?: { detail?: string; message?: string } } })?.response?.data?.detail ??
        (joinError as { response?: { data?: { detail?: string; message?: string } } })?.response?.data?.message ??
        "Project access could not be completed.";
      return { handled: true as const, error: detail };
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      if (bypassAuth) {
        const target = redirectTo || consumePendingInvitePath() || "/home";
        navigateTo(target);
        return;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      const pendingInvitePath = redirectTo || consumePendingInvitePath();
      if (pendingInvitePath) {
        const joinResult = await joinInviteIfNeeded(pendingInvitePath, data.session?.access_token);
        if (joinResult.error) {
          setError(joinResult.error);
          return;
        }
        navigateTo("/home");
        return;
      }

      const role = data.user?.app_metadata?.role || data.user?.user_metadata?.role;
      navigateTo(role === "admin" ? "/admin" : "/home");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GlassCard variant="elevated" className="w-full max-w-[420px]">
      <div className="mb-6 flex flex-col gap-2">
        <LumenLogo size={32} />
        <h1 className="text-2xl font-semibold text-text-primary">Welcome back</h1>
        <p className="text-sm text-text-secondary">Sign in to your lab workspace.</p>
      </div>

      {inviteTarget ? (
        <div className="mb-5 rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-700">
          Invitation detected. After sign in, Lumen will continue the join flow automatically.
        </div>
      ) : null}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          className="input w-full"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          className="input w-full"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" disabled={submitting} className="h-10 rounded-lg bg-primary-500 font-medium text-white">
          {bypassAuth ? "Enter (Dev Bypass)" : submitting ? "Signing in..." : "Sign in"}
        </button>
        {bypassAuth ? <p className="text-xs text-amber-500">Dev bypass mode is on.</p> : null}
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
      </form>

      <div className="mt-5 border-t border-black/10 pt-4">
        <p className="mb-2 text-xs font-medium text-text-muted">Join directly with an invite code</p>
        <div className="flex gap-2">
          <input
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value.toUpperCase().replace(/\s+/g, ""))}
            placeholder="AB12CD34"
            className="input h-9 flex-1 text-sm tracking-[0.12em]"
          />
          <button
            type="button"
            onClick={() => {
              const normalized = inviteCode.trim().toUpperCase();
              if (!normalized) return;
              router.push(`/join/code/${encodeURIComponent(normalized)}`);
            }}
            className="rounded-lg border border-black/10 bg-white px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-black/[0.03] hover:text-text-primary"
          >
            Join
          </button>
        </div>
      </div>

      <p className="mt-5 text-center text-sm text-text-secondary">
        Need access? Ask a workspace admin for an invite link or invite code.
      </p>
    </GlassCard>
  );
}

export default function Page() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(87,172,255,0.2),_transparent_45%),linear-gradient(180deg,_#f7fafc_0%,_#eef3f8_100%)] px-6">
      <Suspense
        fallback={<div className="h-10 w-10 animate-spin rounded-full border-2 border-black/15 border-t-primary-500" />}
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
