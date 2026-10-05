"use client";

import { useRouter } from "next/navigation";
import { Check, Lock, Palette } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { COLOR_THEMES, COLOR_THEME_LEVEL, type ColorThemeId } from "@/features/gamification/catalog";
import { applyColorTheme } from "@/features/gamification/components/color-theme-scope";
import { cn } from "@/lib/utils";
import { chooseColorTheme } from "../actions";

/** Colour themes (legacy theme-1…4). Locked until Level 6; previews instantly. */
export function ThemePickerCard({ initial, level, pointsToUnlock }: { initial: ColorThemeId; level: number; pointsToUnlock: number }) {
  const router = useRouter();
  const [theme, setTheme] = useState(initial);
  const { executeAsync, isPending } = useAction(chooseColorTheme);
  const locked = level < COLOR_THEME_LEVEL;

  async function pick(next: ColorThemeId) {
    if (locked || next === theme) return;
    const previous = theme;
    setTheme(next);
    applyColorTheme(next);
    const result = await executeAsync({ theme: next });
    if (!result?.data) {
      setTheme(previous);
      applyColorTheme(previous);
      toast.error(result?.serverError ?? "We couldn't change your theme.");
      return;
    }
    router.refresh();
  }

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-soft" aria-labelledby="theme-title">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 id="theme-title" className="flex items-center gap-2 text-lg font-semibold">
          <Palette className="size-4.5 text-brand-magenta" aria-hidden /> Colour theme
        </h2>
        {locked ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <Lock className="size-3" aria-hidden /> Level {COLOR_THEME_LEVEL}
          </span>
        ) : null}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        {locked
          ? `Reach Level ${COLOR_THEME_LEVEL} to restyle the whole app — ${pointsToUnlock.toLocaleString()} points to go.`
          : "Make the app yours. Works in light and dark mode."}
      </p>
      <div role="radiogroup" aria-label="Colour theme" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {COLOR_THEMES.map((option) => {
          const active = theme === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-disabled={locked || isPending}
              onClick={() => pick(option.id)}
              className={cn(
                "group relative rounded-2xl border p-2 text-left transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active ? "border-primary/50 bg-secondary" : "hover:bg-muted/60",
                locked && "cursor-not-allowed opacity-55",
              )}
            >
              <span
                className="flex h-14 overflow-hidden rounded-xl"
                style={{ background: `linear-gradient(135deg, ${option.swatch[0]} 0 55%, ${option.swatch[1]} 55% 80%, ${option.swatch[2]} 80%)` }}
                aria-hidden
              />
              <span className="mt-2 flex items-center justify-between px-0.5">
                <span className="text-sm font-semibold">{option.name}</span>
                {active ? (
                  <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3" aria-hidden />
                  </span>
                ) : null}
              </span>
              <span className="block px-0.5 text-xs text-muted-foreground">{option.description}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
