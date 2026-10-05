import type { Metadata } from "next";
import { subDays } from "date-fns";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/features/admin/components/bits";
import { Randomization } from "@/features/admin/components/randomization";
import { getRandomization } from "@/features/admin/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Randomization" };

export default async function RandomizationPage() {
  const viewer = await requirePermission("users.randomize");
  const { control, participants } = await getRandomization();
  const weekAgo = subDays(new Date(), 7).toISOString();
  const recent = participants.filter((row) => (row.interventionStartDate ?? "") >= weekAgo).length;
  const active = participants.filter((row) => row.studyWeek !== null && row.studyWeek <= 24).length;
  const finished = participants.filter((row) => row.studyWeek !== null && row.studyWeek > 24).length;
  const noStart = participants.length - active - finished;

  return (
    <div className="animate-rise">
      <PageHeader
        title="Randomization"
        description="Move people from the control arm into the intervention. Converting starts week 1, the welcome text and the weekly texts."
      />
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Waiting in control" value={control.length} hint="Active control accounts" />
        <StatCard label="In the intervention" value={active} hint={[`${finished} finished the 24 weeks`, noStart ? `${noStart} without a start date` : null].filter(Boolean).join(" · ")} />
        <StatCard label="Converted this week" value={recent} hint="Started in the last 7 days" />
      </div>
      <Randomization control={control} participants={participants} timezone={viewer.timezone} />
    </div>
  );
}
