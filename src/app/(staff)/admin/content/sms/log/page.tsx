import type { Metadata } from "next";
import { subDays } from "date-fns";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/features/admin/components/bits";
import { SendLog } from "@/features/sms/components/send-log";
import { SmsNav } from "@/features/sms/components/sms-nav";
import { getSendLog, unreadInboundCount } from "@/features/sms/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "SMS send log" };

function timeWindow() {
  const now = new Date();
  return {
    weekAgo: subDays(now, 7).toISOString(),
    now: now.toISOString(),
    tomorrow: new Date(now.getTime() + 86_400_000).toISOString(),
  };
}

export default async function SmsLogPage() {
  await requirePermission("sms.manage");
  const [rows, unread] = await Promise.all([getSendLog(), unreadInboundCount()]);
  const { weekAgo, now, tomorrow } = timeWindow();
  const sentRecent = rows.filter((row) => row.status === "sent" && (row.sentAt ?? "") >= weekAgo);
  const sentAll = rows.filter((row) => row.status === "sent");
  const opened = sentAll.filter((row) => row.clickedAt).length;
  const failed = rows.filter((row) => row.status === "failed" && row.scheduledFor >= weekAgo).length;
  const nextDay = rows.filter((row) => row.status === "scheduled" && row.scheduledFor >= now && row.scheduledFor <= tomorrow).length;

  return (
    <div className="animate-rise">
      <PageHeader title="SMS program" description="Every planned and sent program text. Each one is sent exactly once; failed texts can be retried by hand." />
      <SmsNav unreadReplies={unread} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sent in the last 7 days" value={sentRecent.length} />
        <StatCard label="Opened" value={sentAll.length ? `${Math.round((opened / sentAll.length) * 100)}%` : "—"} hint={`${opened} of ${sentAll.length} sent texts`} />
        <StatCard label="Failed this week" value={failed} tone={failed ? "warning" : "default"} hint={failed ? "Check the numbers, then retry" : "All good"} />
        <StatCard label="Going out in 24 hours" value={nextDay} />
      </div>
      <SendLog rows={rows} canManage />
    </div>
  );
}
