"use client";

import { useState } from "react";
import { CornerDownRight, Heart, ImageIcon, TriangleAlert, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatInZone } from "@/lib/dates";
import { formatNumber, REPORT_TIMEZONE } from "../format";
import type { Thread } from "../queries/community";

const STEP = 20;

function When({ iso }: { iso: string }) {
  return <time dateTime={iso}>{formatInZone(iso, "MMM d, yyyy · h:mm a", REPORT_TIMEZONE)}</time>;
}

function Media({ photo, video }: { photo: boolean; video: boolean }) {
  if (!photo && !video) return null;
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      {photo ? (
        <span className="inline-flex items-center gap-1">
          <ImageIcon className="size-3.5" aria-hidden /> Photo
        </span>
      ) : null}
      {video ? (
        <span className="inline-flex items-center gap-1">
          <Video className="size-3.5" aria-hidden /> Video
        </span>
      ) : null}
    </span>
  );
}

function Reactions({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums" title="Reactions">
      <Heart className="size-3.5" aria-hidden />
      <span className="sr-only">Reactions:</span>
      {formatNumber(n)}
    </span>
  );
}

/** The interaction report on screen: each wall post with its replies. */
export function ThreadList({ threads, total }: { threads: Thread[]; total: number }) {
  const [shown, setShown] = useState(STEP);
  if (!threads.length) return null;
  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {threads.slice(0, shown).map((thread) => (
          <li key={thread.id} className="rounded-2xl border bg-card shadow-soft">
            <article className="px-4 py-3.5 sm:px-5">
              <header className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-mono text-[0.8rem] font-semibold">{thread.sid}</span>
                <span className="text-muted-foreground">
                  <When iso={thread.createdAt} />
                </span>
                <span className="text-xs text-muted-foreground">Post {thread.legacyId}</span>
                <span className="ml-auto flex items-center gap-3">
                  <Media photo={thread.hasPhoto} video={thread.hasVideo} />
                  <Reactions n={thread.reactions} />
                </span>
              </header>
              {thread.headline ? (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-brand-apricot/20 px-2 py-0.5 text-xs font-medium text-foreground">
                  <TriangleAlert className="size-3.5" aria-hidden />
                  Content warning: {thread.headline}
                </p>
              ) : null}
              <p className="mt-2 text-[0.9rem] leading-relaxed whitespace-pre-line">{thread.body || <span className="text-muted-foreground italic">No text</span>}</p>
            </article>
            {thread.comments.length ? (
              <ol className="space-y-2 border-t bg-muted/30 px-4 py-3 sm:px-5" aria-label={`${thread.comments.length} replies`}>
                {thread.comments.map((comment) => (
                  <li key={comment.id} className="flex gap-2.5">
                    <CornerDownRight className="mt-0.5 size-4 shrink-0 text-muted-foreground/70" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                        <span className="font-mono font-semibold">{comment.sid}</span>
                        <span className="text-muted-foreground">
                          <When iso={comment.createdAt} />
                        </span>
                        <span className="ml-auto flex items-center gap-3">
                          <Media photo={comment.hasPhoto} video={comment.hasVideo} />
                          <Reactions n={comment.reactions} />
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm leading-relaxed whitespace-pre-line">{comment.body || <span className="text-muted-foreground italic">No text</span>}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="border-t px-4 py-2 text-xs text-muted-foreground sm:px-5">No replies from study participants.</p>
            )}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span className="tabular-nums">
          Showing {formatNumber(Math.min(shown, threads.length))} of {formatNumber(total)} posts
          {total > threads.length ? " (the export has all of them)" : ""}
        </span>
        {shown < threads.length ? (
          <Button variant="outline" onClick={() => setShown((n) => n + STEP)}>
            Show {Math.min(STEP, threads.length - shown)} more
          </Button>
        ) : null}
      </div>
    </div>
  );
}
