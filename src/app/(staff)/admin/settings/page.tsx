import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { SettingsForm } from "@/features/admin/components/settings-form";
import { getSettings } from "@/features/admin/settings";
import { aiConfigured } from "@/features/ai-coach/claude";
import { qualtricsConfigured } from "@/features/surveys/qualtrics";
import { getSurveys } from "@/features/surveys/service";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePermission("settings.manage");
  const [settings, surveys] = await Promise.all([getSettings(), getSurveys()]);
  const midpoint = surveys.find((survey) => survey.key === "midpoint")?.url ?? "";
  return (
    <div className="animate-rise">
      <PageHeader title="Settings" description="Study-wide settings. Changes apply right away and are recorded in the audit log." />
      <SettingsForm settings={settings} midpointUrl={midpoint} qualtricsConnected={qualtricsConfigured()} aiConfigured={aiConfigured()} />
    </div>
  );
}
