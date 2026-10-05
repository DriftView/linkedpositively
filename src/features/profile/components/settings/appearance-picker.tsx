"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Automatic", icon: Monitor },
] as const;

/** Light / dark / follow the device. Saved on this device. */
export function AppearancePicker() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const current = mounted ? (theme ?? "system") : null;

  return (
    <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-2.5">
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-2xl border px-2 py-3.5 text-sm font-medium transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "border-primary/40 bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted/60",
            )}
          >
            <Icon className={cn("size-5", active && "text-primary")} aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
