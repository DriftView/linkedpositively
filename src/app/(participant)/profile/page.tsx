import type { Metadata } from "next";
import Link from "next/link";
import { Eye, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LevelCard } from "@/features/gamification/components/level-card";
import { LevelUpGate } from "@/features/gamification/components/level-up-gate";
import { COLOR_THEME_LEVEL } from "@/features/gamification/catalog";
import { LEVELS } from "@/features/gamification/levels";
import { getLevelCopy, getLevelSummary } from "@/features/gamification/queries";
import { AboutMeCard } from "@/features/profile/components/about-me-card";
import { BadgesCard } from "@/features/profile/components/badges-card";
import { EditableAvatar } from "@/features/profile/components/editable-avatar";
import { ProfileHero } from "@/features/profile/components/profile-hero";
import { ThemePickerCard } from "@/features/profile/components/theme-picker-card";
import { getOwnProfile } from "@/features/profile/queries";
import { requireViewer } from "@/server/auth/session";

export const metadata: Metadata = { title: "Your profile" };

export default async function ProfilePage() {
  const viewer = await requireViewer();
  const [profile, summary, levels] = await Promise.all([
    getOwnProfile(viewer),
    getLevelSummary(viewer.id, viewer.timezone),
    getLevelCopy(),
  ]);
  const level = profile.canEarn ? summary.level : 1;
  const next = levels.find((item) => item.level === summary.level + 1);

  return (
    <div className="animate-rise space-y-5">
      <ProfileHero
        name={profile.name}
        username={profile.username}
        level={profile.canEarn ? summary.level : null}
        points={profile.canEarn ? summary.points : null}
        levelHref="/levels"
        tag={profile.canEarn ? null : profile.roleLabel}
        avatar={
          <EditableAvatar
            userId={profile.userId}
            name={profile.name}
            level={level}
            points={summary.points}
            avatarId={profile.avatarId}
            hasPhoto={profile.hasPhoto}
            version={profile.version}
          />
        }
        actions={
          <Button asChild variant="outline" size="icon" className="size-10 rounded-full" aria-label="Account settings">
            <Link href="/settings">
              <Settings />
            </Link>
          </Button>
        }
      />

      <div className="space-y-5 pt-2">
        {profile.canEarn ? <LevelCard summary={summary} headline={next?.headline} compact /> : null}
        <AboutMeCard initial={profile.aboutMe} />
        <BadgesCard initial={profile.badges} level={level} />
        {profile.canEarn ? (
          <ThemePickerCard
            initial={profile.colorThemeChoice}
            level={level}
            pointsToUnlock={Math.max(0, LEVELS[COLOR_THEME_LEVEL - 1].min - summary.points)}
          />
        ) : null}

        {profile.username ? (
          <div className="flex justify-center pt-1">
            <Button asChild variant="ghost" className="h-10 rounded-full text-muted-foreground">
              <Link href={`/people/${encodeURIComponent(profile.username)}?preview=1`}>
                <Eye /> See how others see your profile
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      <LevelUpGate userId={viewer.id} />
    </div>
  );
}
