import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { aiConfigured } from "@/features/ai-coach/claude";
import { AiStats } from "@/features/ai-coach/components/admin/ai-stats";
import { aiStats } from "@/features/ai-coach/queries";
import { voiceConfigured } from "@/features/ai-coach/speech";
import { cn } from "@/lib/utils";
import { can, requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "AI Coach" };

const PERIODS = [7, 30, 90] as const;

export default async function AiOverviewPage(props: PageProps<"/admin/ai">) {
  const viewer = await requirePermission("admin.access");
  if (!can(viewer, "ai.review") && !can(viewer, "reports.view")) redirect("/admin?denied=1");
  const params = await props.searchParams;
  const requested = Number(Array.isArray(params.days) ? params.days[0] : params.days);
  const days = PERIODS.find((period) => period === requested) ?? 30;
  const stats = await aiStats(days);

  return (
    <div className="animate-rise">
      <PageHeader
        title="AI Coach"
        description="How members use the Claude-powered coach, how well it answers, and when it brought people in. Counts only: conversations open from safety alerts."
        actions={
          can(viewer, "ai.review") ? (
            <Button asChild variant="outline">
              <Link href="/admin/ai/alerts">Safety alerts</Link>
            </Button>
          ) : null
        }
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Period" className="inline-flex rounded-lg bg-muted p-1">
          {PERIODS.map((period) => (
            <Link
              key={period}
              href={`/admin/ai?days=${period}`}
              aria-current={period === days ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground",
                period === days && "bg-card text-foreground shadow-soft",
              )}
            >
              {period} days
            </Link>
          ))}
        </nav>
        <p className="text-xs text-muted-foreground">
          Claude: {aiConfigured() ? "connected" : "no API key (fallback mode)"} · Voice: {voiceConfigured() ? "ElevenLabs" : "browser voices"}
        </p>
      </div>
      <AiStats stats={stats} />
    </div>
  );
}
