import Image from "next/image";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { AVATAR_PACKS, BADGE_PACKS, COLOR_THEMES, COLOR_THEME_LEVEL, avatarSrc, badgeSrc } from "../catalog";
import type { LevelCopyItem } from "../queries";

/**
 * All six levels as a vertical journey: what each one promises, the points
 * it starts at and a peek at what it unlocks.
 */
export function LevelRoadmap({ levels, current, points }: { levels: LevelCopyItem[]; current: number; points: number }) {
  return (
    <ol className="relative space-y-3">
      {levels.map((item, index) => {
        const status = item.level < current ? "done" : item.level === current ? "current" : "locked";
        const avatarPacks = AVATAR_PACKS.filter((pack) => pack.level === item.level);
        const badgePack = BADGE_PACKS.find((pack) => pack.level === item.level);
        const toGo = Math.max(0, item.min - points);
        return (
          <li key={item.level} className="relative flex gap-3.5 sm:gap-4">
            {/* rail */}
            <div className="relative flex flex-col items-center">
              <span
                className={cn(
                  "z-10 grid size-10 shrink-0 place-items-center rounded-full font-heading text-base font-bold tabular-nums",
                  status === "done" && "bg-primary text-primary-foreground",
                  status === "current" &&
                    "bg-gradient-to-br from-brand-magenta to-primary text-white shadow-lift ring-4 ring-brand-magenta/15",
                  status === "locked" && "border border-dashed border-border bg-card text-muted-foreground",
                )}
              >
                {status === "done" ? <Check className="size-4.5" aria-hidden /> : item.level}
              </span>
              {index < levels.length - 1 ? (
                <span
                  aria-hidden
                  className={cn("absolute top-10 -bottom-3 w-0.5", status === "done" ? "bg-primary/40" : "bg-border")}
                />
              ) : null}
            </div>

            <div
              className={cn(
                "mb-1 min-w-0 flex-1 rounded-2xl border p-4 transition-colors",
                status === "current" ? "border-brand-magenta/25 bg-card shadow-soft" : "bg-card/60",
                status === "locked" && "bg-transparent",
              )}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="text-[1.05rem] font-semibold">Level {item.level}</h3>
                {status === "current" ? (
                  <span className="rounded-full bg-brand-magenta/10 px-2 py-0.5 text-xs font-semibold text-brand-magenta dark:bg-brand-magenta/20">
                    You&apos;re here
                  </span>
                ) : null}
                <span className="ml-auto text-xs font-medium text-muted-foreground tabular-nums">
                  {item.level === 1 ? "Start" : `${item.min.toLocaleString()} pts`}
                </span>
              </div>
              <p className={cn("mt-1 text-sm", status === "locked" ? "text-muted-foreground" : "text-foreground/85")}>
                {item.headline}
              </p>
              {status === "current" && item.description ? (
                <p className="mt-2 rounded-xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">How to level up: </span>
                  {item.description}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {avatarPacks.map((pack) => (
                  <span key={pack.pack} className="inline-flex items-center gap-2 rounded-full bg-muted/70 py-1 pr-3 pl-1">
                    <span className="flex -space-x-2">
                      {pack.avatars.slice(0, 3).map((id) => (
                        <Image
                          key={id}
                          src={avatarSrc(id)}
                          alt=""
                          width={24}
                          height={24}
                          className={cn("size-6 rounded-full ring-2 ring-card", status === "locked" && "opacity-60 grayscale-[35%]")}
                        />
                      ))}
                    </span>
                    <span className="text-xs font-medium">Avatar pack {pack.pack}</span>
                  </span>
                ))}
                {badgePack ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-muted/70 py-1 pr-3 pl-1.5">
                    <span className="flex -space-x-1.5">
                      {badgePack.badges.slice(0, 3).map((badge) => (
                        <Image
                          key={badge.id}
                          src={badgeSrc(badge.id)}
                          alt=""
                          width={22}
                          height={22}
                          className={cn("size-5.5 object-contain", status === "locked" && "opacity-60 grayscale-[35%]")}
                        />
                      ))}
                    </span>
                    <span className="text-xs font-medium">Badges pack {badgePack.pack}</span>
                  </span>
                ) : null}
                {item.level === COLOR_THEME_LEVEL ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-muted/70 py-1 pr-3 pl-1.5">
                    <span className="flex -space-x-1">
                      {COLOR_THEMES.map((theme) => (
                        <span
                          key={theme.id}
                          className="size-4.5 rounded-full ring-2 ring-card"
                          style={{ background: `linear-gradient(135deg, ${theme.swatch[0]} 50%, ${theme.swatch[1]} 50%)` }}
                        />
                      ))}
                    </span>
                    <span className="text-xs font-medium">Colour themes</span>
                  </span>
                ) : null}
                {item.unlocks
                  .filter((unlock) => !/avatar|badge|colou?r theme/i.test(unlock))
                  .map((unlock) => (
                    <span key={unlock} className="inline-flex h-7 items-center rounded-full bg-muted/70 px-3 text-xs font-medium">
                      {unlock}
                    </span>
                  ))}
              </div>

              {status === "locked" && item.level === current + 1 ? (
                <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Lock className="size-3.5" aria-hidden /> {toGo.toLocaleString()} more points to unlock
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
