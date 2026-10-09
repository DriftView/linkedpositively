"use client";

import { useEffect, useId, useRef } from "react";
import type { AiCoachAppearance } from "@/server/db/schema/ai";
import { cn } from "@/lib/utils";
import { HAIR_COLORS, OUTFIT_COLORS, SKIN_TONES } from "../coach-design";
import type { Viseme } from "../voice-lib";
import "./coach-avatar.css";

export type CoachState = "idle" | "listening" | "thinking" | "speaking";

/**
 * What the voice tells the face, written every frame by the voice player
 * (never through React state):
 * `level` is the loudness of the coach's voice (0–1), `viseme` its current
 * mouth shape.
 */
export type CoachFace = { level: number; viseme: Viseme };

export function newFace(): CoachFace {
  return { level: 0, viseme: "rest" };
}

/** Mouth shapes: half width, upper lip lift and lower lip drop, in SVG units. */
const MOUTH: Record<Viseme, [number, number, number]> = {
  rest: [13, 0, 0],
  A: [12, 4, 13],
  E: [15, 2.5, 7],
  O: [8, 5, 10],
  U: [6, 3, 5],
  M: [13, 0, 0.4],
  F: [13, 1.5, 4],
  L: [12, 2.5, 7],
};
const MOUTH_X = 100;
const MOUTH_Y = 119;

function mouthPath(w: number, up: number, down: number) {
  const x0 = MOUTH_X - w;
  const x1 = MOUTH_X + w;
  const y = MOUTH_Y - 1;
  return `M${x0.toFixed(1)} ${y}C${(MOUTH_X - w * 0.6).toFixed(1)} ${(y - up).toFixed(1)} ${(MOUTH_X + w * 0.6).toFixed(1)} ${(y - up).toFixed(1)} ${x1.toFixed(1)} ${y}C${(MOUTH_X + w * 0.6).toFixed(1)} ${(y + down).toFixed(1)} ${(MOUTH_X - w * 0.6).toFixed(1)} ${(y + down).toFixed(1)} ${x0.toFixed(1)} ${y}Z`;
}

const random = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * The animated AI Coach: an illustrated character in SVG, drawn from the
 * member's design (no vendor, works offline). One animation loop moves it:
 * breathing, a slow head sway, natural blinks and glances, nods while the
 * member talks, brows that lift with emphasis, and a mouth that follows the
 * voice's visemes and loudness. Idle motion stops under prefers-reduced-motion;
 * the mouth still follows speech. `still` draws a static picture (thumbnails).
 */
export function CoachAvatar({
  appearance,
  name,
  state,
  face,
  listen: listenLevel,
  size = 96,
  still = false,
  className,
}: {
  appearance: AiCoachAppearance;
  name: string;
  state: CoachState;
  face?: React.RefObject<CoachFace>;
  /** Loudness of the member's voice (0–1) while the coach listens, for nods. */
  listen?: React.RefObject<number>;
  size?: number;
  still?: boolean;
  className?: string;
}) {
  const uid = `coach${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const bodyRef = useRef<SVGGElement>(null);
  const headRef = useRef<SVGGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const pupilsRef = useRef<SVGGElement>(null);
  const browsRef = useRef<SVGGElement>(null);
  const smileRef = useRef<SVGPathElement>(null);
  const mouthRef = useRef<SVGPathElement>(null);
  const mouthClipRef = useRef<SVGPathElement>(null);
  const teethRef = useRef<SVGRectElement>(null);
  const tongueRef = useRef<SVGEllipseElement>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (still) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const mouth = { w: MOUTH.rest[0], up: 0, down: 0 };
    let level = 0;
    let listen = 0;
    let nextBlink = performance.now() + random(1500, 4000);
    let blinkUntil = 0;
    let nextGlance = performance.now() + random(1200, 3000);
    let gaze = { x: 0, y: 0 };
    let eyes = { x: 0, y: 0 };
    let visible = true;
    let checkedAt = 0;
    let frame = 0;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      // Hidden copies (the page renders one per layout) skip the work.
      if (now - checkedAt > 500) {
        checkedAt = now;
        visible = (svgRef.current?.getBoundingClientRect().width ?? 0) > 0;
      }
      if (!visible) return;
      const current = stateRef.current;
      const f = face?.current;
      const speaking = current === "speaking";
      level += ((speaking ? (f?.level ?? 0) : 0) - level) * 0.3;
      listen += ((current === "listening" ? (listenLevel?.current ?? 0) : 0) - listen) * 0.15;

      // Mouth: the viseme's shape, opened further by loudness.
      const viseme: Viseme = speaking ? (f?.viseme ?? "rest") : "rest";
      const [tw, tup, tdown] = MOUTH[viseme];
      const scale = viseme === "rest" || viseme === "M" ? 1 : Math.min(1.2, 0.55 + level * 0.8);
      mouth.w += (tw - mouth.w) * 0.4;
      mouth.up += (tup * scale - mouth.up) * 0.4;
      mouth.down += (tdown * scale - mouth.down) * 0.4;
      const openness = mouth.up + mouth.down;
      const d = mouthPath(mouth.w, mouth.up, mouth.down);
      mouthRef.current?.setAttribute("d", d);
      mouthClipRef.current?.setAttribute("d", d);
      mouthRef.current?.setAttribute("opacity", openness > 0.8 ? "1" : "0");
      smileRef.current?.setAttribute("opacity", Math.max(0, 1 - openness / 4).toFixed(2));
      teethRef.current?.setAttribute("y", (MOUTH_Y - 1 - mouth.up - 0.5).toFixed(1));
      tongueRef.current?.setAttribute("cy", (MOUTH_Y - 1 + mouth.down * 0.75).toFixed(1));

      if (reduced) return;
      const t = now / 1000;

      // Blinks at irregular intervals, sometimes twice.
      if (now >= nextBlink) {
        blinkUntil = now + 130;
        nextBlink = now + (Math.random() < 0.15 ? 260 : random(2200, 6000));
      }
      const lid = now < blinkUntil ? 0.1 : 1;
      eyesRef.current?.style.setProperty("transform", `scaleY(${lid})`);

      // Glances: small saccades; looks up and aside while thinking, at the member while listening.
      if (now >= nextGlance) {
        nextGlance = now + random(current === "listening" ? 2500 : 1200, 4200);
        gaze =
          current === "thinking"
            ? { x: random(1.5, 3), y: random(-3.5, -2) }
            : current === "listening"
              ? { x: random(-0.6, 0.6), y: 0 }
              : { x: random(-2.2, 2.2), y: random(-1.2, 1) };
      }
      if (current === "thinking" && gaze.y > -1.5) gaze = { x: 2.5, y: -3 };
      eyes = { x: eyes.x + (gaze.x - eyes.x) * 0.35, y: eyes.y + (gaze.y - eyes.y) * 0.35 };
      pupilsRef.current?.setAttribute("transform", `translate(${eyes.x.toFixed(2)} ${eyes.y.toFixed(2)})`);

      // Head: a slow sway, emphasis on loud syllables, and nods while the member talks.
      const sway = Math.sin(t * 0.55) * 1.4 + Math.sin(t * 0.9 + 1) * 0.6;
      const nod = speaking ? level * 2.2 : current === "listening" ? listen * Math.max(0, Math.sin(t * 5)) * 3 : 0;
      const tilt = current === "listening" ? 3 : current === "thinking" ? -2 : 0;
      headRef.current?.style.setProperty(
        "transform",
        `translateY(${(nod * 0.6).toFixed(2)}px) rotate(${(sway + tilt + nod * 0.4).toFixed(2)}deg)`,
      );

      const brow =
        current === "listening" ? -2.5 : current === "thinking" ? -1.5 : speaking ? -Math.max(0, level - 0.5) * 6 : 0;
      browsRef.current?.setAttribute("transform", `translate(0 ${brow.toFixed(2)})`);

      bodyRef.current?.setAttribute("transform", `translate(0 ${(Math.sin(t * 1.4) * 0.9).toFixed(2)})`);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [face, listenLevel, still]);

  const skin = SKIN_TONES[appearance.skin];
  const hair = HAIR_COLORS[appearance.hairColor].color;
  const outfit = OUTFIT_COLORS[appearance.outfitColor].color;
  const hijab = appearance.hair === "hijab";
  const label = `${name}, your AI coach${state === "idle" ? "" : `, ${state}`}`;

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      data-state={state}
      className={cn("coach-avatar shrink-0 select-none", className)}
    >
      <defs>
        <clipPath id={`${uid}-frame`}>
          <circle cx="100" cy="100" r="96" />
        </clipPath>
        <clipPath id={`${uid}-mouth`}>
          <path ref={mouthClipRef} d={mouthPath(...MOUTH.rest)} />
        </clipPath>
        <radialGradient id={`${uid}-skin`} cx="0.45" cy="0.4" r="0.65">
          <stop offset="0.6" stopColor={skin.base} />
          <stop offset="1" stopColor={skin.shade} />
        </radialGradient>
      </defs>

      <circle className="coach-ring" cx="100" cy="100" r="96" fill="none" stroke="var(--brand-sky)" strokeWidth="6" />
      <circle cx="100" cy="100" r="96" fill="var(--secondary)" />

      <g clipPath={`url(#${uid}-frame)`}>
        <g ref={bodyRef}>
          <Outfit kind={appearance.outfit} color={outfit} />
          {hijab ? <HijabBack color={hair} /> : <path d="M86 128 h28 v22 c0 6 -28 6 -28 0 Z" fill={skin.shade} />}

          <g ref={headRef} className="coach-head">
            {hijab ? null : <HairBack style={appearance.hair} color={hair} />}
            {hijab ? null : (
              <>
                <ellipse cx="56" cy="96" rx="8" ry="11" fill={skin.shade} />
                <ellipse cx="144" cy="96" rx="8" ry="11" fill={skin.shade} />
                <Earrings kind={appearance.earrings} />
              </>
            )}
            <ellipse cx="100" cy="92" rx="44" ry="50" fill={`url(#${uid}-skin)`} />

            <FacialHair kind={appearance.facialHair} color={hair} />
            {hijab ? <HijabFront color={hair} /> : <HairFront style={appearance.hair} color={hair} />}

            <g
              ref={browsRef}
              stroke={hijab || appearance.hair === "bald" ? "#2a1a18" : hair}
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            >
              <path d="M74 76 q9 -6 18 -1" />
              <path d="M108 75 q9 -5 18 1" />
            </g>

            <g ref={eyesRef} className="coach-eyes">
              <g ref={pupilsRef}>
                <ellipse cx="83" cy="92" rx="5.5" ry="6.5" fill="#2a1a18" />
                <ellipse cx="117" cy="92" rx="5.5" ry="6.5" fill="#2a1a18" />
                <circle cx="85" cy="89.5" r="1.8" fill="white" />
                <circle cx="119" cy="89.5" r="1.8" fill="white" />
              </g>
            </g>
            <Glasses kind={appearance.glasses} />

            <circle cx="72" cy="108" r="7" fill="var(--brand-pink)" opacity="0.28" />
            <circle cx="128" cy="108" r="7" fill="var(--brand-pink)" opacity="0.28" />
            <path
              d="M98 98 q-4 9 1 12 q3 1 5 -1"
              fill="none"
              stroke={skin.shade}
              strokeWidth="3"
              strokeLinecap="round"
            />
            {appearance.facialHair === "mustache" || appearance.facialHair === "beard" ? (
              <path
                d="M85 112 C91 107 98 109 100 111 C102 109 109 107 115 112 C109 114.5 104 113.5 100 113.5 C96 113.5 91 114.5 85 112 Z"
                fill={hair}
              />
            ) : null}

            {/* Mouth: a resting smile, and an opening shaped by the voice */}
            <path
              ref={smileRef}
              d={`M${MOUTH_X - 15} ${MOUTH_Y - 2} q15 11 30 0`}
              fill="none"
              stroke={skin.lip}
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <path
              ref={mouthRef}
              d={mouthPath(...MOUTH.rest)}
              fill="#4a1525"
              stroke={skin.lip}
              strokeWidth="2"
              strokeLinejoin="round"
              opacity="0"
            />
            <g clipPath={`url(#${uid}-mouth)`}>
              <ellipse ref={tongueRef} cx={MOUTH_X} cy={MOUTH_Y} rx="7" ry="3.5" fill="#c0506a" />
              <rect ref={teethRef} x={MOUTH_X - 14} y={MOUTH_Y - 2} width="28" height="4" rx="1.5" fill="#fbf7f2" />
            </g>
          </g>
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

function Outfit({ kind, color }: { kind: AiCoachAppearance["outfit"]; color: string }) {
  const shoulders = <path d="M26 205 C28 160 60 146 100 146 C140 146 172 160 174 205 Z" fill={color} />;
  switch (kind) {
    case "hoodie":
      return (
        <g>
          {shoulders}
          <path d="M62 152 C66 134 134 134 138 152 C126 146 112 144 100 144 C88 144 74 146 62 152 Z" fill={color} />
          <path
            d="M62 152 C66 134 134 134 138 152 C126 146 112 144 100 144 C88 144 74 146 62 152 Z"
            fill="black"
            opacity="0.18"
          />
          <path
            d="M92 156 v18 M108 156 v18"
            stroke="white"
            strokeOpacity="0.7"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </g>
      );
    case "collar":
      return (
        <g>
          {shoulders}
          <path
            d="M80 146 L100 164 L90 172 L74 150 Z M120 146 L100 164 L110 172 L126 150 Z"
            fill="white"
            opacity="0.9"
          />
          <circle cx="100" cy="176" r="2" fill="white" opacity="0.8" />
          <circle cx="100" cy="190" r="2" fill="white" opacity="0.8" />
        </g>
      );
    default:
      return (
        <g>
          {shoulders}
          <path
            d="M80 148 C86 162 114 162 120 148"
            fill="none"
            stroke="white"
            strokeOpacity="0.35"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>
      );
  }
}

function HairBack({ style, color }: { style: AiCoachAppearance["hair"]; color: string }) {
  switch (style) {
    case "curls":
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
    case "afro":
      return (
        <g fill={color}>
          <circle cx="100" cy="72" r="62" />
          {[
            [44, 92, 20],
            [156, 92, 20],
            [52, 46, 18],
            [148, 46, 18],
          ].map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
          ))}
        </g>
      );
    case "long":
      return (
        <path
          d="M52 90 C44 30 156 30 148 90 L156 172 C140 180 128 172 126 150 L74 150 C72 172 60 180 44 172 Z"
          fill={color}
        />
      );
    case "locs":
      return (
        <path
          d="M54 80 C50 40 150 40 146 80 L150 150 C140 156 132 150 130 140 L70 140 C68 150 60 156 50 150 Z"
          fill={color}
        />
      );
    case "bun":
      return <circle cx="100" cy="34" r="16" fill={color} />;
    case "braids":
      return (
        <g fill={color}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <g key={i}>
              <ellipse cx={58 - i * 0.6} cy={104 + i * 11} rx="6" ry="7" />
              <ellipse cx={142 + i * 0.6} cy={104 + i * 11} rx="6" ry="7" />
            </g>
          ))}
        </g>
      );
    default:
      return null;
  }
}

function HairFront({ style, color }: { style: AiCoachAppearance["hair"]; color: string }) {
  switch (style) {
    case "curls":
    case "afro":
      return <path d="M58 82 C60 52 140 52 142 82 C130 66 114 62 100 62 C86 62 70 66 58 82 Z" fill={color} />;
    case "fade":
      return <path d="M57 86 C54 26 146 26 143 86 C140 70 128 60 100 60 C72 60 60 70 57 86 Z" fill={color} />;
    case "buzz":
      return (
        <path d="M57 84 C55 26 145 26 143 84 C138 68 122 58 100 58 C78 58 62 68 57 84 Z" fill={color} opacity="0.75" />
      );
    case "waves":
      return (
        <path
          d="M56 90 C46 24 152 18 145 86 C138 68 120 60 104 62 C110 54 96 52 90 60 C76 62 62 72 56 90 Z"
          fill={color}
        />
      );
    case "long":
      return <path d="M56 94 C46 22 154 20 146 90 C134 64 112 58 94 62 C80 66 66 78 56 94 Z" fill={color} />;
    case "locs":
      return (
        <g fill={color}>
          <path d="M55 86 C52 26 148 26 145 86 C132 70 118 64 100 64 C82 64 68 70 55 86 Z" />
          <rect x="55" y="80" width="9" height="56" rx="4.5" />
          <rect x="136" y="80" width="9" height="56" rx="4.5" />
        </g>
      );
    case "bun":
      return <path d="M57 84 C54 26 146 26 143 84 C136 66 120 58 100 58 C80 58 64 66 57 84 Z" fill={color} />;
    case "braids":
      return (
        <g>
          <path d="M57 86 C54 26 146 26 143 86 C140 70 128 60 100 60 C72 60 60 70 57 86 Z" fill={color} />
          <path
            d="M80 50 C78 60 76 70 74 80 M100 46 V62 M120 50 C122 60 124 70 126 80"
            stroke="black"
            strokeOpacity="0.25"
            strokeWidth="2"
            fill="none"
          />
        </g>
      );
    default:
      return null;
  }
}

function HijabBack({ color }: { color: string }) {
  return <path d="M48 96 C44 28 156 28 152 96 C152 130 166 150 176 205 L24 205 C34 150 48 130 48 96 Z" fill={color} />;
}

function HijabFront({ color }: { color: string }) {
  return (
    <g>
      <path d="M52 100 C48 40 152 40 148 100 C146 76 130 58 100 58 C70 58 54 76 52 100 Z" fill={color} />
      <path
        d="M52 100 C54 128 70 146 100 148 C130 146 146 128 148 100 C150 140 128 160 100 160 C72 160 50 140 52 100 Z"
        fill={color}
      />
      <path d="M58 70 C70 56 130 56 142 70" stroke="white" strokeOpacity="0.2" strokeWidth="3" fill="none" />
    </g>
  );
}

function FacialHair({ kind, color }: { kind: AiCoachAppearance["facialHair"]; color: string }) {
  if (kind === "stubble")
    return (
      <path
        d="M62 108 C64 140 84 150 100 150 C116 150 136 140 138 108 C130 128 116 134 100 134 C84 134 70 128 62 108 Z"
        fill={color}
        opacity="0.25"
      />
    );
  if (kind === "beard")
    return (
      <path
        d="M58 98 C58 146 82 158 100 158 C118 158 142 146 142 98 C136 120 122 129 100 129 C78 129 64 120 58 98 Z"
        fill={color}
      />
    );
  return null;
}

function Glasses({ kind }: { kind: AiCoachAppearance["glasses"] }) {
  if (kind === "none") return null;
  return (
    <g fill="white" fillOpacity="0.08" stroke="#2a2a2a" strokeWidth="2.5">
      {kind === "round" ? (
        <>
          <circle cx="83" cy="92" r="11" />
          <circle cx="117" cy="92" r="11" />
        </>
      ) : (
        <>
          <rect x="70" y="83" width="26" height="18" rx="4" />
          <rect x="104" y="83" width="26" height="18" rx="4" />
        </>
      )}
      <path d="M94 91 q6 -4 12 0 M71 89 L57 87 M129 89 L143 87" fill="none" />
    </g>
  );
}

function Earrings({ kind }: { kind: AiCoachAppearance["earrings"] }) {
  if (kind === "studs")
    return (
      <g fill="#e8c35a">
        <circle cx="55" cy="106" r="2.5" />
        <circle cx="145" cy="106" r="2.5" />
      </g>
    );
  if (kind === "hoops")
    return (
      <g fill="none" stroke="#e8c35a" strokeWidth="2">
        <circle cx="55" cy="111" r="5.5" />
        <circle cx="145" cy="111" r="5.5" />
      </g>
    );
  return null;
}
