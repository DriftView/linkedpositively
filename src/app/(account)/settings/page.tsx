import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, HeartHandshake, KeyRound, MonitorSmartphone, Palette, UserRound } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { AccountForm } from "@/features/profile/components/settings/account-form";
import { AppearancePicker } from "@/features/profile/components/settings/appearance-picker";
import { PasswordForm } from "@/features/profile/components/settings/password-form";
import { PeerNavProfileForm } from "@/features/profile/components/settings/peer-nav-profile-form";
import { SessionsCard } from "@/features/profile/components/settings/sessions-card";
import { SettingsSection } from "@/features/profile/components/settings/settings-section";
import { getAccountSettings, getSessions } from "@/features/profile/queries";
import { can, requireViewer } from "@/server/auth/session";

export const metadata: Metadata = { title: "Settings" };

/** Account settings for everyone (legacy /user/{uid}/edit, /myaccount, profile password block). */
export default async function SettingsPage() {
  const viewer = await requireViewer();
  const [settings, sessions] = await Promise.all([getAccountSettings(viewer), getSessions()]);
  const hasLpProfile = can(viewer, "lp.access");

  return (
    <div className="animate-rise space-y-5">
      <PageHeader title="Settings" description="Your account, password and how the app looks." />

      {hasLpProfile && !viewer.staff ? (
        <Link
          href="/profile"
          className="group flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3 text-sm text-secondary-foreground transition-colors hover:bg-accent"
        >
          <UserRound className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="flex-1">Looking for your avatar, badges or about me? They&apos;re on your profile.</span>
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      ) : null}

      <SettingsSection id="account" icon={<UserRound />} title="Your details" description="Only your display name is shown to other members.">
        <AccountForm
          initial={{
            name: settings.name,
            username: settings.username,
            email: settings.email,
            timezone: settings.timezone,
            phone: settings.phone,
          }}
          showPhone={settings.showPhone}
        />
      </SettingsSection>

      {settings.showPeerNavProfile ? (
        <SettingsSection
          id="peer-navigation"
          icon={<HeartHandshake />}
          title="Peer Navigation profile"
          description={settings.isCoach ? "What your participants see about you." : "Helps your peer navigator get to know you."}
        >
          <PeerNavProfileForm initial={settings.peerNav} isCoach={settings.isCoach} />
        </SettingsSection>
      ) : null}

      <SettingsSection id="password" icon={<KeyRound />} title="Change your password" description="You'll need your current password.">
        <PasswordForm />
      </SettingsSection>

      <SettingsSection
        id="devices"
        icon={<MonitorSmartphone />}
        title="Where you're signed in"
        description="If you see a device you don't recognise, sign it out and change your password."
      >
        <SessionsCard key={sessions.map((session) => session.id).join()} sessions={sessions} timezone={viewer.timezone} />
      </SettingsSection>

      <SettingsSection id="appearance" icon={<Palette />} title="Appearance" description="Saved on this device.">
        <AppearancePicker />
      </SettingsSection>
    </div>
  );
}
