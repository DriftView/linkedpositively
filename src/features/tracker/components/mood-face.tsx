import Image from "next/image";
import { cn } from "@/lib/utils";
import { moodFor } from "../moods";

/** One of the 12 mood faces. Decorative unless `label` is set. */
export function MoodFace({
  mood,
  size = 40,
  label = false,
  className,
}: {
  mood: number;
  size?: number;
  label?: boolean;
  className?: string;
}) {
  const info = moodFor(mood);
  if (!info) return null;
  return (
    <Image
      src={info.src}
      alt={label ? info.label : ""}
      aria-hidden={label ? undefined : true}
      width={size}
      height={size}
      unoptimized
      draggable={false}
      className={cn("pointer-events-none shrink-0 select-none", className)}
    />
  );
}
