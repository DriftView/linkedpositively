import Image from "next/image";
import { badgeSrc } from "@/features/gamification/catalog";
import { cn } from "@/lib/utils";
import type { BadgeDto } from "../queries";

/** The badges someone picked, as a tidy grid of cards. */
export function BadgeShelf({ badges, className }: { badges: BadgeDto[]; className?: string }) {
  return (
    <ul className={cn("grid grid-cols-3 gap-2.5 sm:grid-cols-4", className)}>
      {badges.map((badge) => (
        <li
          key={badge.id}
          className="flex flex-col items-center gap-1.5 rounded-2xl bg-muted/60 px-2 pt-3 pb-2.5 text-center"
        >
          <Image src={badgeSrc(badge.id)} alt="" width={64} height={64} className="size-14 object-contain drop-shadow-sm" />
          <span className="text-xs leading-tight font-medium text-balance">{badge.name}</span>
        </li>
      ))}
    </ul>
  );
}
