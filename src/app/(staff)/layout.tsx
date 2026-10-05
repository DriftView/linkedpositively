import { StaffShell } from "@/components/app/staff-shell";
import { getShellCounts } from "@/features/notifications/counts";
import { can, requirePermission } from "@/server/auth/session";
import { staffNav } from "@/server/nav";

/** Study workspace for staff and peer navigators. */
export default async function StaffLayout({ children }: LayoutProps<"/">) {
  const viewer = await requirePermission("admin.access");
  const counts = await getShellCounts(viewer);
  return (
    <StaffShell
      groups={staffNav(viewer)}
      unread={counts.unreadMessages}
      bellHref={can(viewer, "peernav.messages") ? "/coach/messages" : undefined}
      user={{
        id: viewer.id,
        name: viewer.name,
        username: viewer.username,
        image: viewer.image,
        roleLabel: viewer.roleLabel,
        impersonating: Boolean(viewer.impersonatedBy),
      }}
    >
      {children}
    </StaffShell>
  );
}
