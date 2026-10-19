"use client";

import { cn } from "@/lib/utils";
import type { Coach } from "../coach-design";
import { CoachAvatar, type CoachFace, type CoachState } from "./coach-avatar";

type Props = {
  coach: Pick<Coach, "name" | "appearance" | "photo" | "photoFocus">;
  /** The video coach is available: show the coach's photo instead of the drawn coach. */
  realistic: boolean;
  state: CoachState;
  face?: React.RefObject<CoachFace>;
  listen?: React.RefObject<number>;
  size?: number;
  still?: boolean;
  className?: string;
};

/**
 * The coach's face outside a video call. Where the video coach is available
 * it is the coach's photo (the face members meet on video), with a ring while
 * it speaks or listens; otherwise it is the animated drawn coach.
 */
export function CoachPortrait({ coach, realistic, ...avatar }: Props) {
  if (!realistic) return <CoachAvatar appearance={coach.appearance} name={coach.name} {...avatar} />;
  const size = avatar.size ?? 96;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a small static portrait from /public
    <img
      src={coach.photo}
      alt={`${coach.name}, your AI coach${avatar.state === "idle" ? "" : `, ${avatar.state}`}`}
      width={size}
      height={size}
      draggable={false}
      style={{ objectPosition: coach.photoFocus }}
      className={cn(
        "aspect-square shrink-0 rounded-full bg-secondary object-cover ring-brand-sky transition-shadow duration-300 select-none motion-reduce:transition-none",
        avatar.state === "speaking" ? "ring-4" : avatar.state === "listening" ? "ring-2" : "ring-0",
        avatar.className,
      )}
    />
  );
}
