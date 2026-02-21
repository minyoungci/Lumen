"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/shared/GlassCard";
import { supabase } from "@/lib/supabase";

export default function Page() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const bypassAuth = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (bypassAuth) {
      router.push("/daily-log");
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
    const role = data.user?.user_metadata?.role || data.user?.app_metadata?.role;
    if (role === "admin") {
      router.push("/admin");
    } else {
      router.push("/daily-log");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <GlassCard variant="elevated" className="w-full max-w-[400px]">
        <div className="flex flex-col gap-2 mb-6">
          <div className="h-8 w-8 rounded bg-primary-500" />
          <h1 className="text-2xl font-semibold">Welcome back</h1>
          <p className="text-sm text-text-secondary">Sign in to your lab workspace</p>
        </div>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            className="input w-full"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            className="input w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="submit"
            className="h-10 rounded-lg bg-primary-500 text-white font-medium"
          >
            {bypassAuth ? "Enter (Dev Bypass)" : "Sign In"}
          </button>
          {bypassAuth && (
            <p className="text-xs text-amber-300">Dev bypass mode is ON</p>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>

        <p className="mt-5 text-center text-sm text-text-secondary">
          계정이 없으신가요?{" "}
          <Link href="/signup" className="font-medium text-primary-500 hover:underline">
            회원가입
          </Link>
        </p>
      </GlassCard>
    </div>
  );
}
