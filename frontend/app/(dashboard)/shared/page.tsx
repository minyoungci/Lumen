import Link from "next/link";
import { GlassCard } from "@/components/shared/GlassCard";

export default function SharedSpacePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Shared Space</h1>
      <p className="text-sm text-white/60">팀 문서(Articles)와 Kanban 보드를 관리합니다.</p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link href="/shared/articles">
          <GlassCard variant="interactive">
            <h2 className="text-lg font-semibold">Articles</h2>
            <p className="mt-1 text-sm text-white/60">공유 아티클 문서를 확인하고 작성합니다.</p>
          </GlassCard>
        </Link>

        <Link href="/shared/kanban">
          <GlassCard variant="interactive">
            <h2 className="text-lg font-semibold">Kanban</h2>
            <p className="mt-1 text-sm text-white/60">작업 카드 진행 상태를 관리합니다.</p>
          </GlassCard>
        </Link>
      </div>
    </div>
  );
}
