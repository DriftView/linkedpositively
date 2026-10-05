import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { GlossaryManager } from "@/features/glossary/components/glossary-manager";
import { listGlossaryTerms } from "@/features/glossary/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Glossary" };

export default async function AdminGlossaryPage() {
  await requirePermission("content.manage");
  const terms = await listGlossaryTerms();
  return (
    <div>
      <PageHeader
        title="Glossary"
        description="Plain-language definitions members can look up from the app."
        actions={
          <Button variant="outline" asChild>
            <Link href="/glossary" target="_blank">
              <ExternalLink /> View glossary
            </Link>
          </Button>
        }
      />
      <GlossaryManager terms={terms} />
    </div>
  );
}
