"use client";

import { CloudOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Friendly error state for Peer Navigation segments (error.tsx). */
export function ErrorPanel({ retry, rounded }: { retry: () => void; rounded?: boolean }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-muted/40 px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
        <CloudOff aria-hidden className="size-6" />
      </span>
      <div>
        <p className="font-semibold">This didn&apos;t load</p>
        <p className="mt-1 text-sm text-muted-foreground">It&apos;s probably a connection hiccup. Nothing you entered here was lost.</p>
      </div>
      <Button size="lg" onClick={retry} className={rounded ? "rounded-full" : undefined}>
        <RotateCcw aria-hidden />
        Try again
      </Button>
    </div>
  );
}
