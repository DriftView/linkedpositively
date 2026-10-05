"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Award, Check, Lock, Pencil } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { BADGE_PACKS, badgeById, badgeSrc } from "@/features/gamification/catalog";
import { cn } from "@/lib/utils";
import { chooseBadges } from "../actions";
import type { BadgeDto } from "../queries";
import { BadgeShelf } from "./badge-shelf";
import { ResponsiveDialog } from "./responsive-dialog";

/** Your badges ("stickers"), with the two-pack picker. Pack 2 unlocks at Level 3. */
export function BadgesCard({ initial, level }: { initial: BadgeDto[]; level: number }) {
  const router = useRouter();
  const [badges, setBadges] = useState(initial);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const { executeAsync, isPending } = useAction(chooseBadges);

  function start() {
    setDraft(badges.map((badge) => badge.id));
    setOpen(true);
  }

  function toggle(id: string) {
    setDraft((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function save() {
    const previous = badges;
    const next = draft.map((id) => badgeById(id)).filter(Boolean) as BadgeDto[];
    setBadges(next);
    setOpen(false);
    const result = await executeAsync({ badges: draft });
    if (!result?.data) {
      setBadges(previous);
      toast.error(result?.serverError ?? "We couldn't save your badges. Please try again.");
      return;
    }
    toast.success("Your badges have been updated.");
    if (result.data.completed) toast.success("Profile complete! +50 points");
    router.refresh();
  }

  const changed = draft.length !== badges.length || draft.some((id) => !badges.some((badge) => badge.id === id));

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-soft" aria-labelledby="badges-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="badges-title" className="flex items-center gap-2 text-lg font-semibold">
          <Award className="size-4.5 text-brand-magenta" aria-hidden /> Badges
        </h2>
        {badges.length ? (
          <Button variant="ghost" size="sm" className="h-9 rounded-full px-3" onClick={start}>
            <Pencil /> Edit
          </Button>
        ) : null}
      </div>
      {badges.length ? (
        <BadgeShelf badges={badges} />
      ) : (
        <button
          type="button"
          onClick={start}
          className="flex w-full items-center gap-4 rounded-2xl border border-dashed bg-muted/40 p-4 text-left transition-colors hover:bg-secondary/60"
        >
          <span className="flex -space-x-3">
            {BADGE_PACKS[0].badges.slice(0, 3).map((badge) => (
              <Image key={badge.id} src={badgeSrc(badge.id)} alt="" width={40} height={40} className="size-10 object-contain" />
            ))}
          </span>
          <span>
            <span className="block text-sm font-semibold">Show what you&apos;re about</span>
            <span className="block text-sm text-muted-foreground">Pick badges like Book Worm or Pet Lover.</span>
          </span>
        </button>
      )}

      <ResponsiveDialog
        open={open}
        onOpenChange={(next) => !isPending && setOpen(next)}
        title="Choose your badges"
        description="Pick as many as feel like you. Others see them on your profile."
        footer={
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground tabular-nums">{draft.length} selected</p>
            <Button className="h-11 rounded-full px-6 text-[0.95rem]" disabled={!changed || isPending} onClick={save}>
              {isPending ? <Spinner /> : <Check />} Save badges
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {BADGE_PACKS.map((pack) => {
            const locked = level < pack.level;
            return (
              <section key={pack.pack} aria-label={`Badges pack ${pack.pack} of ${BADGE_PACKS.length}${locked ? ", locked" : ""}`}>
                <div className="mb-2.5 flex items-center justify-between">
                  <h3 className="font-sans text-sm font-semibold">
                    Badges <span className="font-normal text-muted-foreground">· Pack {pack.pack} of {BADGE_PACKS.length}</span>
                  </h3>
                  {locked ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      <Lock className="size-3" aria-hidden /> Unlocks at Level {pack.level}
                    </span>
                  ) : null}
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {pack.badges.map((badge) => {
                    const active = draft.includes(badge.id);
                    return (
                      <button
                        key={badge.id}
                        type="button"
                        disabled={locked}
                        aria-pressed={active}
                        onClick={() => toggle(badge.id)}
                        className={cn(
                          "relative flex flex-col items-center gap-1.5 rounded-2xl border px-1.5 pt-3 pb-2 text-center transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                          active
                            ? "border-primary/40 bg-secondary shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_25%,transparent)]"
                            : "border-transparent bg-muted/50 hover:bg-muted",
                          locked && "opacity-50",
                        )}
                      >
                        <Image
                          src={badgeSrc(badge.id)}
                          alt=""
                          width={56}
                          height={56}
                          className={cn("size-12 object-contain", locked && "grayscale")}
                        />
                        <span className="text-[0.7rem] leading-tight font-medium text-balance">{badge.name}</span>
                        {active ? (
                          <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-3" aria-hidden />
                          </span>
                        ) : null}
                        {locked ? <Lock className="absolute top-2 right-2 size-3 text-muted-foreground" aria-hidden /> : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </ResponsiveDialog>
    </section>
  );
}
