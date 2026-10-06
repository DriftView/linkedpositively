"use client";

import { useEffect, useId, useRef } from "react";
import type { AiCoachLook } from "@/server/db/schema/ai";
import { cn } from "@/lib/utils";
import { coachLook } from "../constants";
import "./coach-avatar.css";

export type CoachState = "idle" | "listening" | "thinking" | "speaking";

/**
 * The animated AI Coach: an illustrated, warm character drawn in SVG (no
 * vendor, works offline). It breathes and blinks, raises its brows while
 * listening, looks up while thinking, and moves its mouth with the voice:
 * `level` is a ref the voice player updates every frame (0 = closed, 1 = wide
 * open), read here in an animation frame loop so speech never re-renders React.
 */
export function CoachAvatar({
  look,
  state,
  level,
  size = 96,
  className,
}: {
  look: AiCoachLook;
  state: CoachState;
  level?: React.RefObject<number>;
  size?: number;
  className?: string;
}) {
  const mouthRef = useRef<SVGEllipseElement>(null);
  const clipId = useId();
  const colors = coachLook(look);

  useEffect(() => {
    if (state !== "speaking") {
      mouthRef.current?.style.setProperty("transform", "scaleY(0)");
      return;
    }
    let frame = 0;
    let smoothed = 0;
    const tick = () => {
      const target = Math.min(1, Math.max(0, level?.current ?? 0));
      smoothed += (target - smoothed) * 0.35;
      mouthRef.current?.style.setProperty("transform", `scaleY(${(0.08 + smoothed * 0.92).toFixed(3)})`);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state, level]);

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={`${colors.name}, your AI coach${state === "idle" ? "" : `, ${state}`}`}
      data-state={state}
      className={cn("coach-avatar shrink-0 select-none", className)}
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="100" cy="100" r="96" />
        </clipPath>
      </defs>

      <circle className="coach-ring" cx="100" cy="100" r="96" fill="none" stroke="var(--brand-sky)" strokeWidth="6" />
      <circle cx="100" cy="100" r="96" fill="var(--secondary)" />

      <g clipPath={`url(#${clipId})`}>
        <g className="coach-body">
          {/* Hair behind the head */}
          <HairBack look={look} color={colors.hair} />

          {/* Shoulders and shirt */}
          <path d="M28 205 C30 160 60 146 100 146 C140 146 170 160 172 205 Z" fill={colors.shirt} />
          <path d="M80 148 C86 162 114 162 120 148" fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="4" strokeLinecap="round" />
          {/* Neck */}
          <path d="M86 128 h28 v22 c0 6 -28 6 -28 0 Z" fill={colors.skinShade} />

          {/* Ears */}
          <ellipse cx="56" cy="96" rx="8" ry="11" fill={colors.skinShade} />
          <ellipse cx="144" cy="96" rx="8" ry="11" fill={colors.skinShade} />
          {/* Head */}
          <ellipse cx="100" cy="92" rx="44" ry="50" fill={colors.skin} />

          <HairFront look={look} color={colors.hair} />

          {/* Brows */}
          <g className="coach-brows" stroke={colors.hair} strokeWidth="4" strokeLinecap="round" fill="none">
            <path d="M74 76 q9 -6 18 -1" />
            <path d="M108 75 q9 -5 18 1" />
          </g>

          {/* Eyes */}
          <g className="coach-eyes">
            <g className="coach-eyes-look">
              <ellipse cx="83" cy="92" rx="5.5" ry="6.5" fill="#2a1a18" />
              <ellipse cx="117" cy="92" rx="5.5" ry="6.5" fill="#2a1a18" />
              <circle cx="85" cy="89.5" r="1.8" fill="white" />
              <circle cx="119" cy="89.5" r="1.8" fill="white" />
            </g>
          </g>

          {/* Cheeks and nose */}
          <circle cx="72" cy="108" r="7" fill="var(--brand-pink)" opacity="0.28" />
          <circle cx="128" cy="108" r="7" fill="var(--brand-pink)" opacity="0.28" />
          <path d="M98 98 q-4 9 1 12 q3 1 5 -1" fill="none" stroke={colors.skinShade} strokeWidth="3" strokeLinecap="round" />

          {/* Mouth: a smile, with an opening that follows the voice */}
          <path d="M84 118 q16 12 32 0" fill="none" stroke="#7a2e3a" strokeWidth="3.5" strokeLinecap="round" />
          <ellipse ref={mouthRef} className="coach-mouth-open" cx="100" cy="121" rx="11" ry="8" fill="#5b1f2e" style={{ transform: "scaleY(0)" }} />
        </g>
      </g>

      {state === "thinking" ? (
        <g className="coach-dots" fill="var(--brand-plum)">
          <circle cx="150" cy="40" r="5" />
          <circle cx="164" cy="40" r="5" />
          <circle cx="178" cy="40" r="5" />
        </g>
      ) : null}
    </svg>
  );
}

function HairBack({ look, color }: { look: AiCoachLook; color: string }) {
  switch (look) {
    case "amara":
      // Full natural curls
      return (
        <g fill={color}>
          {[
            [60, 60, 26],
            [100, 40, 30],
            [140, 60, 26],
            [52, 95, 22],
            [148, 95, 22],
            [78, 44, 24],
            [122, 44, 24],
            [56, 125, 16],
            [144, 125, 16],
          ].map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
          ))}
        </g>
      );
    case "kai":
      // Shoulder-length locs
      return (
        <g fill={color}>
          <path d="M54 80 C50 40 150 40 146 80 L150 150 C140 156 132 150 130 140 L70 140 C68 150 60 156 50 150 Z" />
        </g>
      );
    default:
      return null;
  }
}

function HairFront({ look, color }: { look: AiCoachLook; color: string }) {
  switch (look) {
    case "amara":
      return <path d="M58 82 C60 52 140 52 142 82 C130 66 114 62 100 62 C86 62 70 66 58 82 Z" fill={color} />;
    case "jordan":
      // Short fade
      return <path d="M57 86 C54 46 146 46 143 86 C140 70 128 58 100 58 C72 58 60 70 57 86 Z" fill={color} />;
    case "luis":
      // Wavy side part
      return <path d="M56 90 C48 44 150 34 145 86 C138 68 120 60 104 62 C110 54 96 52 90 60 C76 62 62 72 56 90 Z" fill={color} />;
    case "kai":
      return (
        <g fill={color}>
          <path d="M56 84 C56 50 144 50 144 84 C132 70 118 64 100 64 C82 64 68 70 56 84 Z" />
          <rect x="55" y="80" width="9" height="56" rx="4.5" />
          <rect x="136" y="80" width="9" height="56" rx="4.5" />
        </g>
      );
  }
}
