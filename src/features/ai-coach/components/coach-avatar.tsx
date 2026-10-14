"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { AiCoachAppearance } from "@/server/db/schema/ai";
import { cn } from "@/lib/utils";
import { coachEyeColor, HAIR_COLORS, OUTFIT_COLORS, SKIN_TONES } from "../coach-design";
import type { CoachScene } from "./coach-avatar-3d";
import { createCoachMotion, MOUTH, type CoachFace, type CoachState } from "./coach-motion";
import "./coach-avatar.css";

export { newFace, type CoachFace, type CoachState } from "./coach-motion";

const MOUTH_X = 100;
const MOUTH_Y = 119;

function mouthPath(w: number, up: number, down: number) {
  const x0 = MOUTH_X - w;
  const x1 = MOUTH_X + w;
  const y = MOUTH_Y - 1;
  return `M${x0.toFixed(1)} ${y}C${(MOUTH_X - w * 0.6).toFixed(1)} ${(y - up).toFixed(1)} ${(MOUTH_X + w * 0.6).toFixed(1)} ${(y - up).toFixed(1)} ${x1.toFixed(1)} ${y}C${(MOUTH_X + w * 0.6).toFixed(1)} ${(y + down).toFixed(1)} ${(MOUTH_X - w * 0.6).toFixed(1)} ${(y + down).toFixed(1)} ${x0.toFixed(1)} ${y}Z`;
}

type CoachAvatarProps = {
  appearance: AiCoachAppearance;
  name: string;
  state: CoachState;
  face?: React.RefObject<CoachFace>;
  /** Loudness of the member's voice (0–1) while the coach listens, for nods. */
  listen?: React.RefObject<number>;
  size?: number;
  still?: boolean;
  className?: string;
};

/** Below this size (chat bubbles, thumbnails) the 2D drawing reads better and costs nothing. */
const MIN_3D_SIZE = 100;

/**
 * The animated AI Coach, drawn from the member's design (no vendor, works
 * offline). Large live avatars are 3D (three.js, loaded on demand); small and
 * `still` ones (thumbnails) are SVG, which is also shown while 3D loads and
 * whenever WebGL isn't available. Both move the same way (coach-motion.ts).
 */
export function CoachAvatar(props: CoachAvatarProps) {
  const { size = 96, still = false } = props;
  if (still || size < MIN_3D_SIZE) return <CoachAvatar2D {...props} />;
  return <CoachAvatar3D {...props} />;
}

function CoachAvatar3D({ appearance, name, state, face, listen, size = 96, className }: CoachAvatarProps) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CoachScene | null>(null);
  const stateRef = useRef(state);
  const appearanceRef = useRef(appearance);
  const sizeRef = useRef(size);
  const appearanceKey = JSON.stringify(appearance);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    appearanceRef.current = JSON.parse(appearanceKey) as AiCoachAppearance;
    sceneRef.current?.setAppearance(appearanceRef.current);
  }, [appearanceKey]);
  useEffect(() => {
    sizeRef.current = size;
    sceneRef.current?.setSize(size);
  }, [size]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || failed) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const motion = createCoachMotion({ reduced });
    let scene: CoachScene | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let starting = false;
    let cancelled = false;
    let onScreen = true;
    let frame = 0;

    const stop = () => {
      cancelAnimationFrame(frame);
      canvas?.removeEventListener("webglcontextlost", fail);
      scene?.dispose();
      canvas?.remove();
      scene = null;
      canvas = null;
      sceneRef.current = null;
      if (!cancelled) setReady(false);
    };
    function fail() {
      stop();
      if (!cancelled) setFailed(true);
    }
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (!scene || !onScreen) return;
      const pose = motion.step(now, stateRef.current, face?.current, listen?.current ?? 0);
      scene.render(pose, stateRef.current);
    };
    // A scene (and its WebGL context) exists only while this copy is laid out:
    // the page renders one per layout and hides the others.
    const start = async () => {
      if (scene || starting) return;
      starting = true;
      try {
        const { createCoachScene } = await import("./coach-avatar-3d");
        if (cancelled || host.clientWidth === 0) return;
        canvas = document.createElement("canvas");
        canvas.className = "block size-full";
        canvas.addEventListener("webglcontextlost", fail);
        host.appendChild(canvas);
        scene = createCoachScene(canvas, appearanceRef.current);
        scene.setSize(sizeRef.current);
        sceneRef.current = scene;
        setReady(true);
        frame = requestAnimationFrame(tick);
      } catch {
        fail();
      } finally {
        starting = false;
      }
    };

    const resize = new ResizeObserver(() => {
      if (host.clientWidth > 0) void start();
      else stop();
    });
    resize.observe(host);
    const intersection = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
    });
    intersection.observe(host);
    // Outfit colors follow the theme (light/dark).
    const theme = new MutationObserver(() => scene?.refreshColors());
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });

    return () => {
      cancelled = true;
      resize.disconnect();
      intersection.disconnect();
      theme.disconnect();
      stop();
    };
  }, [face, listen, failed]);

  const shown = ready && !failed;
  return (
    <div
      role="img"
      aria-label={avatarLabel(name, state)}
      data-state={state}
      style={{ width: size, height: size }}
      className={cn("coach-avatar relative shrink-0 select-none", className)}
    >
      {shown ? (
        <svg viewBox="0 0 200 200" aria-hidden className="absolute inset-0 size-full overflow-visible">
          <circle
            className="coach-ring"
            cx="100"
            cy="100"
            r="96"
            fill="none"
            stroke="var(--brand-sky)"
            strokeWidth="6"
          />
          <circle cx="100" cy="100" r="96" fill="var(--secondary)" />
        </svg>
      ) : (
        <CoachAvatar2D
          appearance={appearance}
          name={name}
          state={state}
          face={face}
          listen={listen}
          size={size}
          decorative
          className="absolute inset-0"
        />
      )}
      <div ref={hostRef} className={cn("absolute inset-[2%] overflow-hidden rounded-full", !shown && "invisible")} />
      {shown && state === "thinking" ? (
        <svg viewBox="0 0 200 200" aria-hidden className="pointer-events-none absolute inset-0 size-full">
          <ThinkingDots />
        </svg>
      ) : null}
    </div>
  );
}

function avatarLabel(name: string, state: CoachState) {
  return `${name}, your AI coach${state === "idle" ? "" : `, ${state}`}`;
}

function ThinkingDots() {
  return (
    <g className="coach-dots" fill="var(--brand-plum)">
      <circle cx="150" cy="40" r="5" />
      <circle cx="164" cy="40" r="5" />
      <circle cx="178" cy="40" r="5" />
    </g>
  );
}

/**
 * The coach as an illustrated SVG character. One animation loop moves it;
 * idle motion stops under prefers-reduced-motion, the mouth still follows
 * speech. `still` draws a static picture (thumbnails); `decorative` hides it
 * from assistive tech when a wrapper already labels it.
 */
function CoachAvatar2D({
  appearance,
  name,
  state,
  face,
  listen: listenLevel,
  size = 96,
  still = false,
  decorative = false,
  className,
}: CoachAvatarProps & { decorative?: boolean }) {
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
    const motion = createCoachMotion({ reduced });
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
      const pose = motion.step(now, stateRef.current, face?.current, listenLevel?.current ?? 0);

      const { w, up, down } = pose.mouth;
      const openness = up + down;
      const d = mouthPath(w, up, down);
      mouthRef.current?.setAttribute("d", d);
      mouthClipRef.current?.setAttribute("d", d);
      mouthRef.current?.setAttribute("opacity", openness > 0.8 ? "1" : "0");
      smileRef.current?.setAttribute("opacity", Math.max(0, 1 - openness / 4).toFixed(2));
      teethRef.current?.setAttribute("y", (MOUTH_Y - 1 - up - 0.5).toFixed(1));
      tongueRef.current?.setAttribute("cy", (MOUTH_Y - 1 + down * 0.75).toFixed(1));

      if (reduced) return;
      eyesRef.current?.style.setProperty("transform", `scaleY(${pose.lid})`);
      pupilsRef.current?.setAttribute("transform", `translate(${pose.eyes.x.toFixed(2)} ${pose.eyes.y.toFixed(2)})`);
      headRef.current?.style.setProperty(
        "transform",
        `translateY(${(pose.nod * 0.6).toFixed(2)}px) rotate(${pose.roll.toFixed(2)}deg)`,
      );
      browsRef.current?.setAttribute("transform", `translate(0 ${pose.brow.toFixed(2)})`);
      bodyRef.current?.setAttribute("transform", `translate(0 ${pose.bob.toFixed(2)})`);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [face, listenLevel, still]);

  const skin = SKIN_TONES[appearance.skin];
  const hair = HAIR_COLORS[appearance.hairColor].color;
  const eyes = coachEyeColor(appearance);
  const outfit = OUTFIT_COLORS[appearance.outfitColor].color;
  const hijab = appearance.hair === "hijab";

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : avatarLabel(name, state)}
      aria-hidden={decorative || undefined}
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
                <ellipse cx="83" cy="92" rx="5.5" ry="6.5" fill={eyes} />
                <ellipse cx="117" cy="92" rx="5.5" ry="6.5" fill={eyes} />
                <ellipse cx="83" cy="92" rx="3.2" ry="3.8" fill="#1a0f0b" />
                <ellipse cx="117" cy="92" rx="3.2" ry="3.8" fill="#1a0f0b" />
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

      {state === "thinking" ? <ThinkingDots /> : null}
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
