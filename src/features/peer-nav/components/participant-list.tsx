"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, UsersRound, X } from "lucide-react";
import { UserAvatar } from "@/components/app/user-avatar";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import type { ParticipantListItem } from "../types";
import { ProgressRing } from "./bits";

/**
 * The coach's participant list (left column of the dashboard). Instant search,
 * "/" focuses it, ↑/↓ move between participants, Enter opens.
 */
export function ParticipantList({
  participants,
  showCoach,
  scopeLabel,
}: {
  participants: ParticipantListItem[];
  showCoach: boolean;
  scopeLabel: string;
}) {
  const params = useParams<{ participantId?: string }>();
  const router = useRouter();
  const activeId = params.participantId;
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return participants;
    return participants.filter((p) =>
      [p.name, p.username, p.pronouns ?? "", p.coach?.name ?? ""].some((field) => field.toLowerCase().includes(q)),
    );
  }, [participants, query]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function focusItem(index: number) {
    const links = listRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-participant]");
    if (!links?.length) return;
    links[Math.max(0, Math.min(links.length - 1, index))]?.focus();
  }

  function onListKey(event: React.KeyboardEvent) {
    const links = [...(listRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-participant]") ?? [])];
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index <= 0) inputRef.current?.focus();
      else focusItem(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusItem(links.length - 1);
    }
  }

  const unreadTotal = participants.reduce((sum, p) => sum + p.unread, 0);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="px-1 pb-3">
        <h2 className="text-base font-semibold">Participants</h2>
        <p className="text-xs text-muted-foreground tabular-nums">
          {participants.length} {scopeLabel}
          {unreadTotal ? <span className="font-medium text-brand-magenta"> · {unreadTotal} unread</span> : null}
        </p>
      </div>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              focusItem(0);
            } else if (e.key === "Enter" && filtered[0]) {
              router.push(`/coach/${filtered[0].id}`);
            } else if (e.key === "Escape") {
              setQuery("");
            }
          }}
          placeholder="Search by name"
          aria-label="Search participants"
          className="h-10 w-full rounded-xl border border-input bg-background pr-10 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        ) : (
          <Kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 max-lg:hidden">/</Kbd>
        )}
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        {participants.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/40 px-4 py-8 text-center">
            <UsersRound aria-hidden className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">No participants yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              When a coordinator assigns participants to you, they&apos;ll show up here.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">No one matches “{query}”.</p>
        ) : (
          <ul ref={listRef} onKeyDown={onListKey} className="flex flex-col gap-1 pb-2" aria-label="Participants">
            {filtered.map((p) => {
              const active = p.id === activeId;
              return (
                <li key={p.id}>
                  <Link
                    data-participant
                    href={`/coach/${p.id}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-2.5 py-2 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                      active ? "bg-secondary text-secondary-foreground" : "hover:bg-muted/70",
                    )}
                  >
                    <UserAvatar userId={p.id} name={p.name} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {showCoach ? (p.coach ? `Coach: ${p.coach.name}` : "No coach yet") : `@${p.username}`}
                        {p.pronouns ? ` · ${p.pronouns}` : ""}
                      </span>
                    </span>
                    {p.unread ? (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-magenta px-1.5 text-[0.7rem] font-semibold text-primary-foreground tabular-nums">
                        <span className="sr-only">Unread messages: </span>
                        {p.unread}
                      </span>
                    ) : null}
                    <ProgressRing value={p.completed} total={p.total} size={30} stroke={3}>
                      <span className="text-[0.62rem] font-semibold tabular-nums">{p.completed}</span>
                    </ProgressRing>
                    <span className="sr-only">
                      {p.completed} of {p.total} sessions complete
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
