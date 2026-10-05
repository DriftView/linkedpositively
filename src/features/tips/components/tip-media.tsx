"use client";

import { ExternalLink, FileText, Play } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { TipCardData } from "../types";

/**
 * Video with a click-to-play facade (no third-party iframe until the person
 * asks for it), so a carousel of video tips stays light.
 */
export function TipVideo({ video, title }: { video: NonNullable<TipCardData["video"]>; title: string }) {
  const [playing, setPlaying] = useState(false);
  if (!video.embedUrl) {
    return (
      <a
        href={video.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-xl bg-muted/60 px-4 py-3 text-sm font-medium text-primary hover:bg-muted"
      >
        <Play className="size-4" /> Watch the video <ExternalLink className="ml-auto size-4" />
      </a>
    );
  }
  return (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
      {playing ? (
        <iframe
          src={`${video.embedUrl}${video.embedUrl.includes("?") ? "&" : "?"}autoplay=1`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 size-full"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group/play absolute inset-0 flex items-center justify-center focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label={`Play video: ${title}`}
        >
          {video.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote provider thumbnail
            <img src={video.thumbnailUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
          ) : (
            <span className="absolute inset-0 bg-gradient-to-br from-primary/80 via-brand-magenta/70 to-brand-apricot/60" />
          )}
          <span className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
          <span className="relative flex size-16 items-center justify-center rounded-full bg-white/95 text-primary shadow-lift transition-transform group-hover/play:scale-105">
            <Play className="ml-1 size-7 fill-current" />
          </span>
        </button>
      )}
    </div>
  );
}

export function TipAttachments({ tip, className }: { tip: TipCardData; className?: string }) {
  if (!tip.hasPdf && !tip.link) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {tip.hasPdf ? (
        <a
          href={`/tips/${tip.id}/pdf`}
          target="_blank"
          rel="noopener"
          className="inline-flex h-10 items-center gap-2 rounded-full bg-secondary px-4 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent"
        >
          <FileText className="size-4" />
          {tip.pdfName ? `Open ${tip.pdfName}` : "Open the guide (PDF)"}
        </a>
      ) : null}
      {tip.link ? (
        <a
          href={tip.link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-full bg-secondary px-4 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent"
        >
          Read more
          <ExternalLink className="size-4" />
        </a>
      ) : null}
    </div>
  );
}
