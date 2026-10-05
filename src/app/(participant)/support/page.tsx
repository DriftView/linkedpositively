import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { SupportCenter } from "@/features/support/components/support-center";
import { listMyTickets } from "@/features/support/queries";
import { requireViewer } from "@/server/auth/session";

export const metadata = { title: "Tech support" };

export default async function SupportPage() {
  const viewer = await requireViewer();
  const tickets = await listMyTickets(viewer.id);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Tech support"
        description={
          <>
            Something not working? Tell us and we&apos;ll help. Quick answers may be in the{" "}
            <Link href="/pages/faq" className="font-medium text-primary underline-offset-4 hover:underline">
              FAQ
            </Link>
            .
          </>
        }
      />
      <SupportCenter initialTickets={tickets} timezone={viewer.timezone} />
    </div>
  );
}
