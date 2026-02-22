"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function HomePage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/daily-log");
      } else {
        setChecked(true);
      }
    });
  }, [router]);

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap');
        .font-instrument { font-family: 'Instrument Serif', serif; }
      `}</style>

      <div className="relative min-h-screen bg-black text-white overflow-x-hidden">
        {/* Background video */}
        <div className="absolute inset-0 z-0 overflow-hidden flex items-start justify-center">
          <video
            autoPlay
            loop
            muted
            playsInline
            style={{
              transform: "scale(1.2)",
              transformOrigin: "center bottom",
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center bottom",
            }}
          >
            <source
              src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260215_121759_424f8e9c-d8bd-4974-9567-52709dfb6842.mp4"
              type="video/mp4"
            />
          </video>
        </div>

        {/* Blur overlay — desktop */}
        <div
          className="absolute z-10 hidden md:block"
          style={{
            top: "215px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "801px",
            height: "384px",
            background: "black",
            filter: "blur(77.5px)",
            borderRadius: "50%",
            opacity: 0.7,
          }}
        />
        {/* Blur overlay — mobile */}
        <div
          className="absolute z-10 md:hidden"
          style={{
            top: "150px",
            left: 0,
            width: "100vw",
            height: "250px",
            background: "black",
            filter: "blur(77.5px)",
            opacity: 0.7,
          }}
        />

        {/* Navbar */}
        <nav
          className="relative z-20 mx-auto flex max-w-[1440px] items-center justify-between px-5 md:px-[120px]"
          style={{ height: "102px" }}
        >
          {/* Logo */}
          <Link href="/" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Lumen"
              className="h-10 w-auto object-contain"
              style={{ mixBlendMode: "screen" }}
            />
          </Link>

          {/* CTAs */}
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-white/80 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-[#7b39fc] px-4 py-2 text-sm font-medium text-white hover:bg-[#6a2eeb] transition-colors"
            >
              Get Started
            </Link>
          </div>
        </nav>

        {/* Hero */}
        <main className="relative z-20 flex flex-col items-center text-center px-5">
          <div className="mt-[100px] md:mt-[162px] max-w-[871px]">
            <h1
              className="font-instrument text-[42px] md:text-[76px] leading-tight text-white"
              style={{ letterSpacing: "-1px" }}
            >
              Your lab. Your notes.
              <br />
              <em>Always in sync.</em>
            </h1>
            <p
              className="mx-auto mt-5 max-w-[613px] text-[15px] md:text-[18px] leading-relaxed"
              style={{ color: "#a0a0b0" }}
            >
              Research workspace for scientists and teams — daily logs,
              shared notes, and a knowledge graph.
            </p>

            {/* CTA */}
            <div className="mt-8 flex items-center justify-center">
              <Link
                href="/signup"
                className="rounded-xl bg-[#7b39fc] px-8 py-3.5 text-sm font-semibold text-white hover:bg-[#6a2eeb] transition-colors"
              >
                Get Started Free
              </Link>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
