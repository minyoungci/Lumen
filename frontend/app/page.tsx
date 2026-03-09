"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { LumenLogo } from "@/components/brand/LumenLogo";

const PRINCIPLES = [
  {
    title: "Daily work stays visible",
    body: "Write today once, then keep the context in the same workspace instead of scattering it across chat and docs.",
  },
  {
    title: "Team updates stay lightweight",
    body: "Short feed posts and long-form docs live side by side, so sharing does not interrupt the work itself.",
  },
  {
    title: "Knowledge compounds",
    body: "Notes, tags, and linked content become a graph you can search and revisit when the project gets messy.",
  },
] as const;

const WORK_SURFACES = [
  {
    eyebrow: "Journal",
    title: "Capture the day while the details are fresh.",
    copy: "Templates, autosave, and project-aware sharing help teams turn raw work into reusable context.",
    href: "/daily-log",
  },
  {
    eyebrow: "Docs",
    title: "Move from rough thinking to a team-ready narrative.",
    copy: "Research notes and team docs share the same writing core, so editing feels consistent across the product.",
    href: "/shared/articles",
  },
  {
    eyebrow: "Updates",
    title: "Share progress without creating another meeting.",
    copy: "Fast project updates, comments, and reactions keep collaboration flowing between deeper docs.",
    href: "/shared/feed",
  },
] as const;

export default function HomePage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/home");
      } else {
        setChecked(true);
      }
    });
  }, [router]);

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f5ee]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-primary-500" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f8f5ee] text-text-primary">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-10%] top-[-120px] h-[360px] w-[360px] rounded-full bg-[#f9c27c]/35 blur-[110px]" />
        <div className="absolute right-[-10%] top-[120px] h-[420px] w-[420px] rounded-full bg-[#90d5ff]/35 blur-[120px]" />
        <div className="absolute bottom-[-120px] left-[25%] h-[340px] w-[340px] rounded-full bg-[#c8b5ff]/28 blur-[110px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1320px] flex-col px-5 pb-10 pt-6 md:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-3 rounded-full border border-black/[0.08] bg-white/82 px-4 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur-[16px]">
          <Link href="/" className="flex items-center gap-3">
            <LumenLogo size={28} />
            <div>
              <p className="text-sm font-semibold">Lumen</p>
              <p className="text-[11px] text-text-muted">Research workspace for focused teams</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/plans"
              className="rounded-full px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-black/[0.04] hover:text-text-primary"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-black/10 bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black/85"
            >
              Enter workspace
            </Link>
          </div>
        </header>

        <main className="grid flex-1 gap-10 pt-14 lg:grid-cols-[minmax(0,1.08fr)_520px] lg:items-center lg:pt-12">
          <section>
            <div className="inline-flex rounded-full border border-black/10 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
              Keep research moving
            </div>
            <h1 className="mt-6 max-w-[12ch] text-[46px] font-semibold leading-[0.94] tracking-[-0.04em] text-[#18181b] md:text-[72px]">
              Less tool noise.
              <br />
              More shared context.
            </h1>
            <p className="mt-6 max-w-[560px] text-lg leading-8 text-text-secondary">
              Lumen helps research teams capture daily work, turn it into durable docs, and keep the whole project legible.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="rounded-full bg-primary-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
              >
                Sign in
              </Link>
              <Link
                href="/plans"
                className="rounded-full border border-black/10 bg-white/88 px-6 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-white"
              >
                See plans
              </Link>
            </div>

            <div className="mt-12 grid gap-3 md:grid-cols-3">
              {PRINCIPLES.map((item) => (
                <div
                  key={item.title}
                  className="rounded-[28px] border border-black/[0.08] bg-white/80 p-5 shadow-[0_18px_36px_rgba(15,23,42,0.05)]"
                >
                  <p className="text-sm font-semibold text-text-primary">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">{item.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="relative">
            <div className="rounded-[36px] border border-black/[0.08] bg-white/82 p-5 shadow-[0_28px_70px_rgba(15,23,42,0.08)] backdrop-blur-[20px]">
              <div className="rounded-[28px] border border-black/[0.08] bg-[#111827] px-5 py-4 text-white">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">Workspace preview</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-white/50">Today</p>
                    <p className="mt-2 text-sm font-medium">Experiment log</p>
                    <p className="mt-1 text-xs text-white/65">Autosaved · ready to share</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-white/50">Docs</p>
                    <p className="mt-2 text-sm font-medium">Protocol v3</p>
                    <p className="mt-1 text-xs text-white/65">Team comments opened</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-white/50">Feed</p>
                    <p className="mt-2 text-sm font-medium">Cell line anomaly</p>
                    <p className="mt-1 text-xs text-white/65">5 replies · 2 reactions</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {WORK_SURFACES.map((surface) => (
                  <Link
                    key={surface.title}
                    href={surface.href}
                    className="block rounded-[28px] border border-black/[0.08] bg-[#faf8f3] p-5 transition-colors hover:bg-white"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                      {surface.eyebrow}
                    </p>
                    <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-text-primary">
                      {surface.title}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-text-secondary">{surface.copy}</p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
