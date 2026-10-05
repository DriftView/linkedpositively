import { PageHeader } from "@/components/app/page-header";
import { TrackerTabs } from "@/features/tracker/components/tracker-tabs";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Trackers" };

export default async function TrackerLayout({ children }: LayoutProps<"/tracker">) {
  await requirePermission("tracker.use");
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Your trackers" description="A quick daily check-in, the things you choose to track, and gentle reminders." />
      <TrackerTabs />
      {children}
    </div>
  );
}
