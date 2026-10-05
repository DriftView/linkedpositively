"use client";

import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";

const COLORS = ["var(--brand-magenta)", "var(--primary)", "var(--brand-apricot)", "var(--brand-sky)", "var(--brand-pink)"];

/** A one-shot radial confetti burst. Decorative; hidden from assistive tech. */
export function ConfettiBurst({ pieces = 36, spread = 190, seed = 1 }: { pieces?: number; spread?: number; seed?: number }) {
  const reduce = useReducedMotion();
  const particles = useMemo(() => makeParticles(pieces, spread, seed), [pieces, spread, seed]);

  if (reduce) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible">
      {particles.map((particle, index) => (
        <motion.span
          key={index}
          className="absolute"
          style={{
            width: particle.width,
            height: particle.height,
            background: particle.color,
            borderRadius: particle.round ? 999 : 2,
          }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
          animate={{ x: particle.x, y: [0, particle.y, particle.y + 90], opacity: [1, 1, 0], scale: 1, rotate: particle.rotate }}
          transition={{ duration: 1.6, delay: particle.delay, ease: [0.15, 0.7, 0.3, 1], times: [0, 0.55, 1] }}
        />
      ))}
    </div>
  );
}

function makeParticles(pieces: number, spread: number, seed: number) {
  let state = seed * 9301 + 49297;
  const random = () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
  return Array.from({ length: pieces }, (_, index) => {
    const angle = (index / pieces) * Math.PI * 2 + random() * 0.5;
    const distance = spread * (0.55 + random() * 0.45);
    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance * 0.8 - 30,
      rotate: random() * 540 - 270,
      color: COLORS[index % COLORS.length],
      width: 6 + random() * 6,
      height: random() > 0.5 ? 6 + random() * 4 : 12 + random() * 6,
      round: random() > 0.65,
      delay: random() * 0.12,
    };
  });
}
