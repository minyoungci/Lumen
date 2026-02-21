"use client";

import type { FormEvent } from "react";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { GlassCard } from "@/components/shared/GlassCard";
import { supabase } from "@/lib/supabase";

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const bypassAuth = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (bypassAuth) {
      router.push(redirectTo || "/daily-log");
      return;
    }

    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }

    setLoading(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName || email.split("@")[0] },
          emailRedirectTo: redirectTo
            ? `${window.location.origin}${redirectTo}`
            : undefined,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      setDone(true);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <GlassCard variant="elevated" className="w-full max-w-[400px] text-center">
        <div className="mb-4 text-4xl">✉️</div>
        <h1 className="mb-2 text-xl font-semibold">이메일을 확인해주세요</h1>
        <p className="text-sm text-text-secondary">
          <span className="font-medium text-text-primary">{email}</span>로
          확인 링크를 보냈습니다. 링크를 클릭하면 가입이 완료됩니다.
        </p>
        {redirectTo && (
          <p className="mt-3 text-xs text-text-muted">
            이메일 확인 후 초대 링크로 자동으로 이동합니다.
          </p>
        )}
        <Link
          href="/login"
          className="mt-6 block text-sm font-medium text-primary-500 hover:underline"
        >
          로그인 페이지로 돌아가기
        </Link>
      </GlassCard>
    );
  }

  return (
    <GlassCard variant="elevated" className="w-full max-w-[400px]">
      <div className="mb-6 flex flex-col gap-2">
        <div className="h-8 w-8 rounded bg-primary-500" />
        <h1 className="text-2xl font-semibold">Create account</h1>
        <p className="text-sm text-text-secondary">새 Lumen 계정을 만드세요</p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="이름 (Display Name)"
          className="input w-full"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <input
          type="email"
          placeholder="이메일"
          className="input w-full"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="비밀번호 (8자 이상)"
          className="input w-full"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          type="password"
          placeholder="비밀번호 확인"
          className="input w-full"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="h-10 rounded-lg bg-primary-500 font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
        >
          {bypassAuth ? "Enter (Dev Bypass)" : loading ? "가입 중..." : "회원가입"}
        </button>

        {bypassAuth && (
          <p className="text-xs text-amber-500">Dev bypass mode is ON</p>
        )}
      </form>

      <p className="mt-5 text-center text-sm text-text-secondary">
        이미 계정이 있으신가요?{" "}
        <Link href="/login" className="font-medium text-primary-500 hover:underline">
          로그인
        </Link>
      </p>
    </GlassCard>
  );
}

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <Suspense fallback={<div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />}>
        <SignUpForm />
      </Suspense>
    </div>
  );
}
