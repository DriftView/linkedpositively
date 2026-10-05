import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Replies } from "@/features/sms/components/replies";
import { SmsNav } from "@/features/sms/components/sms-nav";
import { getInbound } from "@/features/sms/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "SMS replies" };

export default async function SmsRepliesPage() {
  const viewer = await requirePermission("sms.manage");
  const rows = await getInbound();
  const unread = rows.filter((row) => !row.read && row.kind === "message").length;
  return (
    <div className="animate-rise">
      <PageHeader
        title="SMS program"
        description="Texts sent back to the study number. Replying STOP turns someone's study texts off; START turns them back on."
      />
      <SmsNav unreadReplies={unread} />
      <Replies rows={rows} timezone={viewer.timezone} />
    </div>
  );
}
