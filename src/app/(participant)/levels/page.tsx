import type { Metadata } from "next";
import Link from "next/link";
import { History, Route, Sparkles, Trophy } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { EarningGuide } from "@/features/gamification/components/earning-guide";
import { LevelCard } from "@/features/gamification/components/level-card";
import { LevelRoadmap } from "@/features/gamification/components/level-roadmap";
import { LevelUpGate } from "@/features/gamification/components/level-up-gate";
import { PointsHistory } from "@/features/gamification/components/points-history";
import { getLevelCopy, getLevelSummary, getPointHistory } from "@/features/gamification/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Levels & points" };

export default async function LevelsPage() {
  const viewer = await requirePermission("gamification.earn");
  const [summary, levels, history] = await Promise.all([
    getLevelSummary(viewer.id, viewer.timezone),
    getLevelCopy(),
    getPointHistory(viewer.id, { limit: 15 }),
  ]);
  const next = levels.find((item) => item.level === summary.level + 1);

  return (
    <div className="animate-rise space-y-10">
      <PageHeader
        title="Levels & points"
        description="Everything you do here earns points. Level up to unlock new avatars, badges and colour themes."
        actions={
          <Button asChild variant="outline" className="h-10 rounded-full px-4">
            <Link href="/leaderboard">
              <Trophy className="text-brand-magenta" /> Leaderboard
            </Link>
          </Button>
        }
      />

      <LevelCard summary={summary} headline={next?.headline} />

      <section aria-labelledby="journey">
        <SectionTitle id="journey" icon={<Route />} title="Your journey" />
        <LevelRoadmap levels={levels} current={summary.level} points={summary.points} />
      </section>

      <section aria-labelledby="earn">
        <SectionTitle id="earn" icon={<Sparkles />} title="How to earn points" />
        <EarningGuide />
      </section>

      <section aria-labelledby="history">
        <SectionTitle id="history" icon={<History />} title="Recent points" />
        {history.items.length ? (
          <PointsHistory initial={history.items} nextCursor={history.nextCursor} timezone={viewer.timezone} />
        ) : (
          <Empty className="rounded-2xl border bg-card">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Sparkles />
              </EmptyMedia>
              <EmptyTitle>No points yet</EmptyTitle>
              <EmptyDescription>
                Say hello on the <Link href="/">wall</Link> or read a <Link href="/tips">tip</Link> to earn your first
                points.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>

      <LevelUpGate userId={viewer.id} />
    </div>
  );
}

function SectionTitle({ id, icon, title }: { id: string; icon: React.ReactNode; title: string }) {
  return (
    <h2 id={id} className="mb-4 flex items-center gap-2 text-lg font-semibold [&_svg]:size-4.5 [&_svg]:text-brand-magenta">
      {icon}
      {title}
    </h2>
  );
}
