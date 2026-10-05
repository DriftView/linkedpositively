import { PageHeader } from "@/components/app/page-header";
import { SuggestForm } from "@/features/resources/components/suggest-form";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Suggest a resource" };

export default async function SuggestResourcePage() {
  await requirePermission("resources.suggest");
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Suggest a place"
        description="Know a clinic, pantry, group or service that helped you? Tell us and we'll add it after a quick check."
      />
      <SuggestForm />
    </div>
  );
}
