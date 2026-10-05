"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Circular progress towards the next level, with the level number inside.
 * The arc uses the brand gradient (plum → magenta) and draws in on mount.
 */
export function LevelRing({
  level,
  progress,
  size = 112,
  stroke = 9,
  label = "Level",
  className,
}: {
  level: number;
  /** 0–1 */
  progress: number;
  size?: number;
  stroke?: number;
  label?: string;
  className?: string;
}) {
  const id = useId();
  const reduce = useReducedMotion();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, progress));

  return (
    <div
      className={cn("relative grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label} ${level}, ${Math.round(clamped * 100)}% of the way to the next level`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand-magenta)" />
            <stop offset="100%" stopColor="var(--primary)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-muted" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${id}-g)`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: reduce ? circumference * (1 - clamped) : circumference }}
          animate={{ strokeDashoffset: circumference * (1 - clamped) }}
          transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1], delay: 0.15 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-[0.62rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{label}</span>
        <span className="mt-1 font-heading font-bold tabular-nums" style={{ fontSize: size * 0.32 }}>
          {level}
        </span>
      </div>
    </div>
  );
}
