import type { Metadata } from "next";
import { Suspense } from "react";
import { CirclePause } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { env } from "@/env";
import { getSettings } from "@/features/admin/settings";
import { SmsNav } from "@/features/sms/components/sms-nav";
import { TemplateEditor } from "@/features/sms/components/template-editor";
import { getTemplateRows, unreadInboundCount } from "@/features/sms/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "SMS program" };

export default async function SmsTemplatesPage() {
  await requirePermission("sms.manage");
  const [templates, unread, settings] = await Promise.all([getTemplateRows(), unreadInboundCount(), getSettings()]);
  return (
    <div className="animate-rise">
      <PageHeader
        title="SMS program"
        description="The welcome text and one text a week for 24 weeks, sent to every participant at a random time between 7 AM and 9 PM their time."
      />
      <SmsNav unreadReplies={unread} />
      {!settings.smsProgramEnabled ? (
        <p role="status" className="mb-6 flex items-center gap-2 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <CirclePause className="size-4 shrink-0" aria-hidden /> The program is paused in Settings. Nothing is sent until it&apos;s switched back on.
        </p>
      ) : env.DELIVERY_MODE !== "live" ? (
        <p role="status" className="mb-6 rounded-2xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Delivery is in log mode on this server: texts are written to the log instead of being sent.
        </p>
      ) : null}
      <Suspense>
        <TemplateEditor templates={templates} appOrigin={new URL(env.NEXT_PUBLIC_APP_URL).origin} />
      </Suspense>
    </div>
  );
}
