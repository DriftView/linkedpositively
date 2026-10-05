import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MAX_ACTIVE_TRACKERS } from "@/features/tracker/kinds";
import { NewTrackerForm, NewTrackerHint } from "@/features/tracker/components/new-tracker-form";
import { getSmsStatus, listTrackers } from "@/features/tracker/queries";
import type { TrackerKind } from "@/features/tracker/types";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "New tracker" };

export default async function NewTrackerPage() {
  const viewer = await requirePermission("tracker.use");
  const [trackers, sms] = await Promise.all([listTrackers(viewer.id, viewer.timezone), getSmsStatus(viewer.id)]);
  if (trackers.length >= MAX_ACTIVE_TRACKERS) redirect("/tracker/personal");
  const taken = trackers.map((tracker) => tracker.kind).filter((kind): kind is TrackerKind => kind !== "custom");

  return (
    <div className="animate-rise">
      <Link
        href="/tracker/personal"
        className="mb-4 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArrowLeft className="size-4" aria-hidden />
        My trackers
      </Link>
      <h2 className="mb-1 text-xl font-semibold">Create a new tracker</h2>
      <NewTrackerHint />
      <NewTrackerForm sms={sms} timezone={viewer.timezone} taken={taken} />
    </div>
  );
}
