import type { Metadata } from "next";
import { AccountSettings } from "@/features/profile/components/settings/account-settings";
import { requireViewer } from "@/server/auth/session";

export const metadata: Metadata = { title: "Settings" };

/** Account settings in the member portal (staff use /account). */
export default async function SettingsPage() {
  return <AccountSettings viewer={await requireViewer()} />;
}
