import { PageHeader } from "@/components/app/page-header";
import { GlossaryBrowser } from "@/features/glossary/components/glossary-browser";
import { listGlossaryTerms } from "@/features/glossary/queries";
import { requireViewer } from "@/server/auth/session";

export const metadata = { title: "Glossary" };

export default async function GlossaryPage() {
  await requireViewer();
  const terms = await listGlossaryTerms();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Glossary" description="Plain-language meanings of health, HIV and rights words you might come across." />
      <GlossaryBrowser terms={terms} />
    </div>
  );
}
