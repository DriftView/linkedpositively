import Link from "next/link";
import { AlertTriangle, ChevronRight, Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { promptSlots } from "@/features/checkin/queries";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Check-in prompts" };

/** The 10-week rotation of weekly check-in prompts. */
export default async function CheckinPromptsPage() {
  await requirePermission("content.manage");
  const slots = await promptSlots();
  const missing = slots.filter((s) => !s.id).length;
  return (
    <div>
      <PageHeader
        title="Check-in prompts"
        description="Each week's check-in asks the questions of one slot. Slots rotate: week 11 uses slot 1 again."
      />
      {missing ? (
        <p className="mb-5 flex items-center gap-2 rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-warning-foreground dark:text-warning" />
          {missing} {missing === 1 ? "slot has" : "slots have"} no prompt. Participants in those weeks can&apos;t answer their check-in.
        </p>
      ) : null}
      <ol className="grid gap-3 md:grid-cols-2">
        {slots.map((slot) => (
          <li key={slot.sequence}>
            <Link
              href={`/admin/content/check-in/${slot.sequence}`}
              className={cn(
                "group flex h-full items-start gap-4 rounded-xl border bg-card p-4 shadow-soft transition hover:border-primary/40 hover:shadow-lift",
                !slot.id && "border-dashed bg-muted/40 shadow-none",
              )}
            >
              <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <span className="text-[0.6rem] leading-none font-semibold uppercase">Week</span>
                <span className="text-lg leading-tight font-semibold tabular-nums">{slot.sequence}</span>
              </span>
              <span className="min-w-0 flex-1">
                {slot.id ? (
                  <>
                    <span className="block font-medium">{slot.title}</span>
                    <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{slot.likertText}</span>
                    {!slot.feedbackComplete ? (
                      <span className="mt-2 inline-flex rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium">Feedback incomplete</span>
                    ) : null}
                  </>
                ) : (
                  <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                    <Plus className="size-4" /> Add a prompt
                  </span>
                )}
              </span>
              <ChevronRight className="mt-3 size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
