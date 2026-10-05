import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Award, NotebookPen, PenLine } from "lucide-react";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import { UserPostList } from "@/features/community/components/user-post-list";
import { BadgeShelf } from "@/features/profile/components/badge-shelf";
import { ProfileHero } from "@/features/profile/components/profile-hero";
import { getPublicProfile } from "@/features/profile/queries";
import { requirePermission } from "@/server/auth/session";

export async function generateMetadata({ params }: PageProps<"/people/[username]">): Promise<Metadata> {
  const profile = await getPublicProfile((await params).username);
  return { title: profile ? profile.name : "Profile" };
}

/**
 * Someone's public profile card (legacy /user/{uid}): name, level, avatar,
 * about me, badges, and their wall posts. Nothing private is shown.
 */
export default async function PersonPage({ params, searchParams }: PageProps<"/people/[username]">) {
  const viewer = await requirePermission("community.post");
  const profile = await getPublicProfile((await params).username);
  if (!profile) notFound();
  const preview = (await searchParams).preview === "1";
  if (profile.userId === viewer.id && !preview) redirect("/profile");

  const firstName = profile.name.split(" ")[0];

  return (
    <div className="animate-rise space-y-5">
      {preview ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-secondary px-4 py-2.5 text-sm text-secondary-foreground">
          <span>This is how other members see your profile.</span>
          <Button asChild variant="ghost" size="sm" className="h-9 rounded-full">
            <Link href="/profile">
              <ArrowLeft /> Back
            </Link>
          </Button>
        </div>
      ) : null}

      <ProfileHero
        name={profile.name}
        username={profile.username}
        level={profile.level}
        tag={profile.roleLabel}
        levelHref={profile.level !== null ? "/levels" : undefined}
        avatar={
          <UserAvatar
            userId={profile.userId}
            name={profile.name}
            size="xl"
            version={profile.version ?? undefined}
            className="size-28 bg-card text-3xl shadow-lift ring-4 ring-background sm:size-32"
          />
        }
      />

      <div className="space-y-5 pt-2">
        {profile.aboutMe ? (
          <section className="rounded-2xl border bg-card p-5 shadow-soft" aria-labelledby="about-title">
            <h2 id="about-title" className="mb-2 flex items-center gap-2 text-lg font-semibold">
              <NotebookPen className="size-4.5 text-brand-magenta" aria-hidden /> About {firstName}
            </h2>
            <p className="text-[0.95rem] leading-relaxed whitespace-pre-line text-foreground/90">{profile.aboutMe}</p>
          </section>
        ) : null}

        {profile.badges.length ? (
          <section className="rounded-2xl border bg-card p-5 shadow-soft" aria-labelledby="badges-title">
            <h2 id="badges-title" className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <Award className="size-4.5 text-brand-magenta" aria-hidden /> Badges
            </h2>
            <BadgeShelf badges={profile.badges} />
          </section>
        ) : null}

        {!profile.aboutMe && !profile.badges.length ? (
          <p className="rounded-2xl bg-muted/60 px-4 py-5 text-center text-sm text-muted-foreground">
            {firstName} hasn&apos;t added an about me or badges yet.
          </p>
        ) : null}

        <section aria-labelledby="posts-title" className="pt-3">
          <h2 id="posts-title" className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <PenLine className="size-4.5 text-brand-magenta" aria-hidden /> Posts by {firstName}
          </h2>
          <UserPostList userId={profile.userId} viewer={viewer} name={firstName} />
        </section>
      </div>
    </div>
  );
}
