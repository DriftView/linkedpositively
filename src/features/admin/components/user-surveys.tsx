"use client";

import { useRouter } from "next/navigation";
import { CircleCheck, CircleDashed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markCompleteForUserAction } from "@/features/surveys/actions";
import { ConfirmAction, DateText } from "./bits";
import { runAction } from "./run-action";

type Row = { key: "baseline" | "midpoint" | "followup"; title: string; completedAt: string | null; source: string | null };

const SOURCE: Record<string, string> = { qualtrics: "from Qualtrics", participant: "they said so", staff: "marked by staff" };

export function UserSurveys({ userId, surveys, timezone, canEdit }: { userId: string; surveys: Row[]; timezone: string; canEdit: boolean }) {
  const router = useRouter();
  return (
    <ul className="space-y-0.5">
      {surveys.map((survey) => (
        <li key={survey.key} className="flex items-center gap-3 rounded-xl px-2 py-2">
          {survey.completedAt ? (
            <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
          ) : (
            <CircleDashed className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{survey.title}</span>
            <span className="block text-xs text-muted-foreground">
              {survey.completedAt ? (
                <>
                  Done <DateText date={survey.completedAt} timezone={timezone} pattern="MMM d" /> · {SOURCE[survey.source ?? ""] ?? ""}
                </>
              ) : (
                "Not completed"
              )}
            </span>
          </span>
          {!survey.completedAt && canEdit ? (
            <ConfirmAction
              trigger={
                <Button variant="ghost" size="sm">
                  Mark done
                </Button>
              }
              title={`Mark the ${survey.title.toLowerCase()} as done?`}
              description={<p>Use this when the response came in another way. The in-app reminder stops showing.</p>}
              confirmLabel="Mark done"
              onConfirm={async () => {
                const data = await runAction(markCompleteForUserAction({ userId, key: survey.key }), "Marked as done");
                if (!data) return false;
                router.refresh();
              }}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
