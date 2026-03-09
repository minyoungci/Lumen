import Link from "next/link";

const plans = [
  {
    id: "free",
    name: "Free",
    price: "무료",
    desc: "개인 시작용",
    features: ["개인 노트", "기본 검색", "1개 프로젝트"],
    cta: "무료로 시작",
    href: "/signup",
  },
  {
    id: "pro",
    name: "Pro",
    price: "₩19,000/월",
    desc: "개인/소규모 팀 생산성 강화",
    features: ["무제한 프로젝트", "고급 검색/그래프", "우선 지원"],
    cta: "Pro 문의",
    href: "mailto:sales@labbase.ai?subject=LabBase%20Pro%20문의",
    featured: true,
  },
  {
    id: "team",
    name: "Team",
    price: "₩79,000/월",
    desc: "팀 운영 최적화",
    features: ["팀 관리", "관리자 리포트", "온보딩 지원"],
    cta: "Team 문의",
    href: "mailto:sales@labbase.ai?subject=LabBase%20Team%20문의",
  },
];

export default function PlansPage() {
  return (
    <div className="min-h-screen bg-black px-5 py-16 text-white md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-semibold md:text-5xl">요금제</h1>
          <p className="mt-3 text-white/70">팀 규모와 운영 방식에 맞게 선택하세요.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-2xl border p-6 ${
                plan.featured ? "border-violet-400 bg-violet-500/10" : "border-white/15 bg-white/5"
              }`}
            >
              <p className="text-sm text-white/70">{plan.desc}</p>
              <h2 className="mt-2 text-2xl font-semibold">{plan.name}</h2>
              <p className="mt-2 text-3xl font-bold">{plan.price}</p>

              <ul className="mt-5 space-y-2 text-sm text-white/85">
                {plan.features.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-white/90 px-4 py-2 text-sm font-semibold text-black hover:bg-white"
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center text-sm text-white/60">
          궁금한 점은 <a href="mailto:sales@labbase.ai" className="underline">sales@labbase.ai</a> 로 문의 주세요.
        </div>
      </div>
    </div>
  );
}
