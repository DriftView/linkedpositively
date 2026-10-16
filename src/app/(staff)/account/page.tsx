import type { Metadata } from "next";
import { AccountSettings } from "@/features/profile/components/settings/account-settings";
import { requireViewer } from "@/server/auth/session";

export const metadata: Metadata = { title: "Settings" };

/** Account settings in the staff portal (participants use /settings). */
export default async function StaffAccountPage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <AccountSettings viewer={await requireViewer()} />
    </div>
  );
}
