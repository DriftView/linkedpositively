import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { CreateParticipantForm } from "@/features/admin/components/create-participant-form";
import { listCoaches } from "@/features/admin/queries";
import { can, requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Create a new participant" };

export default async function NewParticipantPage() {
  const viewer = await requirePermission("users.create");
  const coaches = await listCoaches();
  return (
    <div className="animate-rise">
      <Link href="/admin/users" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> People
      </Link>
      <PageHeader title="Create a new participant" description="Set up a study account. New accounts start in the control arm unless you start the intervention now." />
      <CreateParticipantForm coaches={coaches} canRandomize={can(viewer, "users.randomize")} />
    </div>
  );
}
