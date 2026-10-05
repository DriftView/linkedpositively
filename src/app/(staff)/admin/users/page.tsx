import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { UserPlus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { UsersTable } from "@/features/admin/components/users-table";
import { USER_VIEWS, type UserView } from "@/features/admin/user-views";
import { listCoaches, listUsers } from "@/features/admin/queries";
import { can, requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "People" };

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const viewer = await requirePermission("users.view");
  const params = await searchParams;
  const view = (USER_VIEWS.some((option) => option.id === params.view) ? params.view : "all") as UserView;
  const program = params.program === "lp" || params.program === "peernav" ? params.program : "all";
  const [rows, coaches] = await Promise.all([listUsers(), listCoaches()]);

  return (
    <>
      <PageHeader
        title="People"
        description="Every account in both programs. Select people to change their study roles, peer navigator or access."
        actions={
          can(viewer, "users.create") ? (
            <Button asChild size="lg">
              <Link href="/admin/users/new">
                <UserPlus /> Create participant
              </Link>
            </Button>
          ) : null
        }
      />
      <Suspense>
        <UsersTable
          rows={rows}
          coaches={coaches}
          timezone={viewer.timezone}
          view={view}
          program={program}
          can={{ randomize: can(viewer, "users.randomize"), edit: can(viewer, "users.edit"), assignCoach: can(viewer, "peernav.assignCoach") }}
        />
      </Suspense>
    </>
  );
}
