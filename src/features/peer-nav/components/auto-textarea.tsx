"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** A textarea that grows with its content. */
export function AutoTextarea({ className, value, minRows = 2, ...props }: React.ComponentProps<"textarea"> & { minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      className={cn(
        "block w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-60 dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}
