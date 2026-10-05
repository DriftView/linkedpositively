import Link from "next/link";
import { Pencil } from "lucide-react";
import { UserAvatar } from "@/components/app/user-avatar";
import { LevelRing } from "@/features/gamification/components/level-ring";
import { getLevelSummary } from "@/features/gamification/queries";
import { can, type Viewer } from "@/server/auth/session";
import { getOwnProfile } from "../queries";

/**
 * Small "you" card for the home sidebar (legacy twm_generic_profile block):
 * picture, name, level (links to /levels), a peek at your about me and a
 * link to edit your profile.
 */
export async function ProfileSidebarCard({ viewer }: { viewer: Viewer }) {
  const [profile, summary] = await Promise.all([getOwnProfile(viewer), getLevelSummary(viewer.id, viewer.timezone)]);
  const earns = can(viewer, "gamification.earn");
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-soft" aria-label="Your profile">
      <div className="flex items-center gap-3">
        <UserAvatar userId={viewer.id} name={viewer.name} size="lg" version={profile.version ?? undefined} />
        <div className="min-w-0 flex-1">
          <Link href="/profile" className="block truncate font-semibold hover:underline">
            {viewer.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">@{viewer.username}</p>
        </div>
        {earns ? (
          <Link href="/levels" aria-label={`Level ${summary.level}. See levels and points`} className="rounded-full">
            <LevelRing level={summary.level} progress={summary.progress} size={52} stroke={5} label="Lvl" />
          </Link>
        ) : null}
      </div>
      {profile.aboutMe ? <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{profile.aboutMe}</p> : null}
      <Link
        href="/profile"
        className="mt-3 flex h-9 items-center justify-center gap-1.5 rounded-full bg-secondary text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent"
      >
        <Pencil className="size-3.5" aria-hidden /> Edit profile
      </Link>
    </section>
  );
}
