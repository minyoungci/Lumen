"use client";

import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { api } from "@/lib/api";

interface Plan {
  id: string;
  name: string;
  price_monthly_krw: number;
  features: string[];
}

function formatKrw(value: number) {
  if (!value) return "Free";
  return `KRW ${value.toLocaleString("ko-KR")} / month`;
}

const FALLBACK_PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price_monthly_krw: 0,
    features: ["Personal notes", "Basic search", "Single workspace"],
  },
  {
    id: "pro",
    name: "Pro",
    price_monthly_krw: 19000,
    features: ["Unlimited docs", "Priority search", "Structured knowledge workflows"],
  },
  {
    id: "team",
    name: "Team",
    price_monthly_krw: 79000,
    features: ["Shared workspaces", "Admin controls", "Team-wide collaboration tools"],
  },
];

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get("/billing/plans");
        if (!mounted) return;
        setPlans(res.data?.data?.plans ?? FALLBACK_PLANS);
      } catch {
        if (!mounted) return;
        setPlans(FALLBACK_PLANS);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const onUpgrade = async (planId: string) => {
    if (planId === "free") return;

    setBusy(planId);
    try {
      const res = await api.post("/billing/checkout", { plan_id: planId });
      const url = res.data?.data?.checkout_url;
      if (url) window.location.href = url;
    } finally {
      setBusy(null);
    }
  };

  const planStats = useMemo(
    () => ({
      total: plans.length,
      paid: plans.filter((plan) => plan.price_monthly_krw > 0).length,
      topTier: plans.reduce((highest, plan) => Math.max(highest, plan.price_monthly_krw), 0),
    }),
    [plans],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-[1px] bg-black/[0.06] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="bg-white/88 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Pricing</p>
            <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.04em] text-text-primary md:text-[38px]">
              Pick the tier that matches
              <br />
              how collaborative the work has become.
            </h1>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-text-secondary">
              Start small, then upgrade only when the workspace needs more shared structure, administrative control,
              and higher-volume collaboration.
            </p>
          </div>

          <div className="grid gap-[1px] bg-black/[0.06] sm:grid-cols-3 lg:grid-cols-1">
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Plans</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{planStats.total}</p>
              <p className="mt-1 text-sm text-text-secondary">Tiers currently available in billing.</p>
            </div>
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Paid tiers</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{planStats.paid}</p>
              <p className="mt-1 text-sm text-text-secondary">Upgrade paths once collaboration grows beyond personal use.</p>
            </div>
            <div className="workspace-stat p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Top tier</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-text-primary">
                {planStats.topTier ? `KRW ${planStats.topTier.toLocaleString("ko-KR")}` : "Free"}
              </p>
              <p className="mt-1 text-sm text-text-secondary">Highest monthly price currently exposed by billing.</p>
            </div>
          </div>
        </div>
      </GlassCard>

      {loading ? (
        <GlassCard>
          <p className="text-sm text-text-muted">Loading plans...</p>
        </GlassCard>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {plans.map((plan) => {
              const featured = plan.id === "pro";
              return (
                <GlassCard
                  key={plan.id}
                  className={`flex h-full flex-col ${featured ? "border-primary-300 ring-1 ring-primary-300/70" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Plan</p>
                      <h2 className="mt-2 text-xl font-semibold text-text-primary">{plan.name}</h2>
                    </div>
                    {featured ? (
                      <span className="rounded-[10px] border border-primary-200 bg-primary-50 px-2 py-1 text-[10px] font-medium text-primary-700">
                        Recommended
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-text-primary">
                    {formatKrw(plan.price_monthly_krw)}
                  </p>
                  <p className="mt-2 text-sm text-text-secondary">
                    {plan.price_monthly_krw === 0
                      ? "Best for solo exploration and early setup."
                      : plan.id === "team"
                        ? "For active labs that need shared control and a stronger operating layer."
                        : "For serious individual use and smaller teams building durable knowledge."}
                  </p>

                  <div className="mt-5 space-y-2">
                    {plan.features.map((feature) => (
                      <div key={feature} className="workspace-inset px-3 py-2.5">
                        <p className="text-sm text-text-primary">{feature}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 flex-1" />

                  <button
                    type="button"
                    onClick={() => void onUpgrade(plan.id)}
                    disabled={busy === plan.id || plan.id === "free"}
                    className={`mt-6 w-full rounded-[12px] px-4 py-2.5 text-sm font-medium transition-colors ${
                      plan.id === "free"
                        ? "cursor-not-allowed border border-black/10 bg-black/[0.04] text-text-muted"
                        : "bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-60"
                    }`}
                  >
                    {plan.id === "free"
                      ? "Current free tier"
                      : busy === plan.id
                        ? "Opening checkout..."
                        : `Choose ${plan.name}`}
                  </button>
                </GlassCard>
              );
            })}
          </div>

          <div className="space-y-5">
            <GlassCard className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">When to upgrade</p>
              <div className="space-y-3">
                <div className="workspace-inset px-4 py-4">
                  <p className="text-sm font-medium text-text-primary">Move from Free to Pro</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    Upgrade when your notes stop being personal scratch space and start acting like reusable project knowledge.
                  </p>
                </div>
                <div className="workspace-inset px-4 py-4">
                  <p className="text-sm font-medium text-text-primary">Move from Pro to Team</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    Upgrade when multiple people need the same workspace, admin controls, and structured collaboration.
                  </p>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">What stays true</p>
              <div className="space-y-3">
                <div className="workspace-inset px-4 py-4">
                  <p className="text-sm font-medium text-text-primary">The core workflow stays familiar</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    Journal, docs, updates, and reviews should feel the same before and after an upgrade.
                  </p>
                </div>
                <div className="workspace-inset px-4 py-4">
                  <p className="text-sm font-medium text-text-primary">Upgrade only when it unlocks real collaboration</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    Pricing should reflect operating needs, not force a heavier workflow before the team is ready.
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
}
