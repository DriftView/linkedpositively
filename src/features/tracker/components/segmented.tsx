"use client";

import { motion } from "motion/react";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Segmented control (the old site's joined "toggle pills") built on a
 * single-select toggle group, with a sliding selection indicator.
 */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  label,
  size = "default",
  className,
}: {
  value: T | null;
  onValueChange: (value: T) => void;
  options: { value: T; label: React.ReactNode; icon?: React.ReactNode }[];
  label: string;
  size?: "sm" | "default";
  className?: string;
}) {
  const id = useId();
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      aria-label={label}
      value={value ?? ""}
      onValueChange={(next) => {
        if (next) onValueChange(next as T);
      }}
      className={cn("inline-flex w-full rounded-full bg-muted p-1 sm:w-auto", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <ToggleGroupPrimitive.Item
            key={option.value}
            value={option.value}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-none",
              size === "sm" ? "h-8 px-3 text-[0.8rem]" : "h-10 text-sm",
              active && "text-foreground",
            )}
          >
            {active ? (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full bg-card shadow-soft ring-1 ring-foreground/5"
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
              />
            ) : null}
            {option.icon ? <span className="relative [&_svg]:size-4">{option.icon}</span> : null}
            <span className="relative">{option.label}</span>
          </ToggleGroupPrimitive.Item>
        );
      })}
    </ToggleGroupPrimitive.Root>
  );
}
