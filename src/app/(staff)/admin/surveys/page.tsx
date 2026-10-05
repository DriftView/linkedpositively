import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { getSettings } from "@/features/admin/settings";
import { QualtricsStatus, ResponsesTable, SurveyCards } from "@/features/surveys/components/survey-admin";
import { getSurveyAdmin } from "@/features/surveys/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Surveys" };

export default async function SurveysAdminPage() {
  const viewer = await requirePermission("surveys.manage");
  const [data, settings] = await Promise.all([getSurveyAdmin(), getSettings()]);
  const titles = Object.fromEntries(data.surveys.map((survey) => [survey.key, survey.title]));
  return (
    <div className="animate-rise space-y-6">
      <PageHeader title="Surveys" description="The study's Qualtrics surveys, when participants are reminded to take them, and every response we've recorded." />
      <QualtricsStatus connected={data.qualtricsConnected} enabled={settings.qualtricsSyncEnabled} />
      <SurveyCards surveys={data.surveys} timezone={viewer.timezone} connected={data.qualtricsConnected} />
      <section className="space-y-3" aria-labelledby="responses-heading">
        <h2 id="responses-heading" className="text-lg font-semibold">
          Responses
        </h2>
        <ResponsesTable rows={data.responses} timezone={viewer.timezone} titles={titles} />
      </section>
    </div>
  );
}
