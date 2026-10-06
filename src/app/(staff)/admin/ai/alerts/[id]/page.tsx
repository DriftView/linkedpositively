import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { audit } from "@/features/admin/audit";
import { AlertReviewForm } from "@/features/ai-coach/components/admin/alert-review-form";
import { CATEGORY_LABEL, LEVEL_CLASS, LEVEL_LABEL, SOURCE_LABEL, STATUS_LABEL } from "@/features/ai-coach/components/admin/labels";
import { getAlertDetail } from "@/features/ai-coach/queries";
import { formatInZone } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { can, requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "AI safety alert" };

export default async function AiAlertPage(props: PageProps<"/admin/ai/alerts/[id]">) {
  const viewer = await requirePermission("ai.review");
  const { id } = await props.params;
  const alert = await getAlertDetail(id);
  if (!alert) notFound();
  // Reading a member's conversation is sensitive: record who looked.
  await audit({
    actor: viewer,
    action: "ai.transcript",
    targetIds: [alert.member.id],
    summary: "Viewed an AI Coach conversation from a safety alert",
    meta: { alertId: alert.id },
  });

  return (
    <div className="animate-rise">
      <Link href="/admin/ai/alerts" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" /> Safety alerts
      </Link>
      <PageHeader
        title={
          <>
            <span className={cn("rounded-full px-3 py-0.5 font-sans text-sm font-semibold", LEVEL_CLASS[alert.level])}>{LEVEL_LABEL[alert.level]}</span>
            {alert.member.name}
          </>
        }
        description={`${CATEGORY_LABEL[alert.category]} · ${SOURCE_LABEL[alert.source]} · ${STATUS_LABEL[alert.status]} · raised ${formatInZone(alert.createdAt, "MMM d, h:mm a", viewer.timezone)}`}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="Conversation" className="rounded-2xl border bg-card shadow-soft">
          <h2 className="border-b px-4 py-3 font-sans text-sm font-semibold">Conversation</h2>
          <ol className="space-y-3 p-4">
            {alert.transcript.map((message) => (
              <li key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[88%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap",
                    message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/70",
                    message.id === alert.messageId && "ring-3 ring-destructive/60",
                  )}
                >
                  {message.text}
                  <span className={cn("mt-1 block text-[0.7rem]", message.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    {message.role === "user" ? "Member" : "Coach"} · {formatInZone(message.createdAt, "MMM d, h:mm a", viewer.timezone)}
                    {message.risk !== "none" ? ` · risk: ${message.risk}` : ""}
                  </span>
                </div>
              </li>
            ))}
            {alert.transcript.length === 0 ? <li className="text-sm text-muted-foreground">The conversation is no longer available.</li> : null}
          </ol>
        </section>
        <div className="space-y-4">
          <section className="space-y-1 rounded-2xl border bg-card p-5 text-sm shadow-soft">
            <h2 className="mb-2 font-sans text-base font-semibold">Member</h2>
            <p>
              {alert.member.name} <span className="text-muted-foreground">@{alert.member.username}</span>
            </p>
            <p className="text-muted-foreground">Peer navigator: {alert.coachName ?? "none"}</p>
            {alert.reason ? <p className="text-muted-foreground">Why flagged: {alert.reason}</p> : null}
            {can(viewer, "users.view") ? (
              <Link href={`/admin/users/${alert.member.id}`} className="inline-block pt-2 font-medium text-primary hover:underline">
                Open member record (contact details)
              </Link>
            ) : null}
          </section>
          <AlertReviewForm id={alert.id} status={alert.status} staffNote={alert.staffNote} />
        </div>
      </div>
    </div>
  );
}
