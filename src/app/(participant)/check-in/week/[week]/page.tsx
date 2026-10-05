import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Minus, NotebookPen, Pill } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { MedsBadge } from "@/features/checkin/components/checkin-flow";
import { weekRange } from "@/features/checkin/format";
import { checkinWeekDetail } from "@/features/checkin/queries";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Check-in" };

/** One week: the day table, your answers and your feedback (the old weekly feedback view). */
export default async function CheckinWeekPage({ params }: PageProps<"/check-in/week/[week]">) {
  const viewer = await requirePermission("checkin.weekly");
  const { week } = await params;
  const detail = await checkinWeekDetail(viewer, Number(week));
  if (!detail) notFound();
  const answered = Boolean(detail.answer?.likertValue && !detail.answer.autoSubmitted);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/check-in/history"
        className="mb-4 -ml-2 inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Past check-ins
      </Link>
      <PageHeader title={`Week ${detail.week}`} description={weekRange(detail.start, detail.end)} />

      <section aria-labelledby="days-heading" className="rounded-2xl border bg-card p-5 shadow-soft">
        <h2 id="days-heading" className="text-lg font-semibold">
          Your week
        </h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th scope="col" className="pb-2 text-left font-medium">
                Day
              </th>
              <th scope="col" className="pb-2 font-medium">
                Meds
              </th>
              <th scope="col" className="pb-2 font-medium">
                Mood
              </th>
              <th scope="col" className="pb-2 font-medium">
                Used?
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {detail.days.map((day) => (
              <tr key={day.date}>
                <th scope="row" className="py-2.5 text-left font-normal">
                  <span className="block font-medium">{day.weekday}</span>
                  <span className="block text-xs text-muted-foreground">{day.label}</span>
                </th>
                <td className="py-2.5">
                  <span className="flex justify-center">
                    <MedsBadge value={day.medsTaken} />
                  </span>
                </td>
                <td className="py-2.5">
                  <span className="flex justify-center">
                    {day.mood ? (
                      // eslint-disable-next-line @next/next/no-img-element -- small static SVG
                      <img src={day.mood.src} alt={day.mood.label} title={day.mood.label} className="size-9" />
                    ) : (
                      <span className="flex size-9 items-center justify-center rounded-full border border-dashed text-muted-foreground" title="No mood logged">
                        <Minus className="size-4" aria-hidden />
                        <span className="sr-only">No mood logged</span>
                      </span>
                    )}
                  </span>
                </td>
                <td className="py-2.5 text-center">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                      day.used === true ? "bg-brand-magenta/10 text-brand-magenta dark:bg-brand-magenta/20" : "text-muted-foreground",
                    )}
                  >
                    {day.used === true ? "Used" : day.used === false ? "No" : "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {answered && detail.answer ? (
        <>
          <section aria-labelledby="answers-heading" className="mt-5 rounded-2xl border bg-card p-5 shadow-soft">
            <h2 id="answers-heading" className="flex items-center gap-2 text-lg font-semibold">
              <NotebookPen className="size-5 text-primary" aria-hidden /> Personal log
            </h2>
            {detail.likertText ? (
              <div className="mt-3">
                <p className="text-sm text-muted-foreground">{detail.likertText}</p>
                <p className="mt-1 font-medium">{detail.likertLabel}</p>
              </div>
            ) : null}
            <div className="mt-4">
              {detail.openText ? <p className="text-sm text-muted-foreground">{detail.openText}</p> : null}
              <p className="mt-1 whitespace-pre-wrap">{detail.answer.openAnswer || <span className="text-muted-foreground">You didn&apos;t write anything this week.</span>}</p>
            </div>
          </section>

          {detail.answer.feedback?.long || detail.answer.feedback?.short ? (
            <section aria-labelledby="feedback-heading" className="mt-5 rounded-2xl border bg-card p-5 shadow-soft">
              <h2 id="feedback-heading" className="text-lg font-semibold">
                Your feedback
              </h2>
              {detail.answer.feedback.long ? <div className="prose-content mt-2" dangerouslySetInnerHTML={{ __html: detail.answer.feedback.long }} /> : null}
              {detail.answer.feedback.short ? (
                <div className="mt-3 flex gap-3 rounded-xl bg-muted/60 p-4">
                  <Pill className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                  <p className="text-[0.95rem]">{detail.answer.feedback.short}</p>
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      ) : (
        <p className="mt-5 rounded-2xl bg-muted/60 px-5 py-4 text-sm text-muted-foreground">
          {detail.isOpen ? (
            <>
              This check-in is still open.{" "}
              <Link href="/check-in" className="font-semibold text-primary underline-offset-4 hover:underline">
                Answer it now
              </Link>
            </>
          ) : (
            "You didn't answer this week's questions — no worries, every week is a fresh start."
          )}
        </p>
      )}
    </div>
  );
}
