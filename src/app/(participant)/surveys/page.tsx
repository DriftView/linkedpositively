import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { SurveyCard, SurveyPromptDialog } from "@/features/surveys/components/survey-prompt-dialog";
import { getParticipantSurveys } from "@/features/surveys/service";
import { requireViewer } from "@/server/auth/session";

export const metadata: Metadata = { title: "Surveys" };

export default async function SurveysPage({ searchParams }: PageProps<"/surveys">) {
  const viewer = await requireViewer();
  const { prompt } = await searchParams;
  const surveys = await getParticipantSurveys({ id: viewer.id, name: viewer.name, timezone: viewer.timezone });
  const due = surveys.filter((survey) => survey.stage);
  const done = surveys.filter((survey) => survey.completed);

  return (
    <div className="animate-rise">
      <PageHeader title="Surveys" description="Short check-ins from the study team. Your answers help make Link Positively better." />
      {surveys.length ? (
        <div className="space-y-4">
          {due.map((survey) => (
            <SurveyCard key={survey.key} survey={survey} timezone={viewer.timezone} />
          ))}
          {done.length ? (
            <>
              <h2 className="pt-4 text-sm font-semibold text-muted-foreground">Finished</h2>
              {done.map((survey) => (
                <SurveyCard key={survey.key} survey={survey} timezone={viewer.timezone} />
              ))}
            </>
          ) : null}
        </div>
      ) : (
        <Empty className="rounded-3xl border bg-card py-14 shadow-soft">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardList />
            </EmptyMedia>
            <EmptyTitle>No surveys right now</EmptyTitle>
            <EmptyDescription>We&apos;ll let you know here and with a message when it&apos;s time for your next one.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {due[0] && prompt === "1" ? <SurveyPromptDialog survey={due[0]} timezone={viewer.timezone} forceOpen /> : null}
    </div>
  );
}
