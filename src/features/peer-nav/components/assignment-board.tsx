"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, Search, UserRoundX } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/app/user-avatar";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { friendlyDate, shortAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { assignCoach } from "../actions";
import type { AssignmentEvent, AssignmentRow } from "../assignments";
import type { PersonRef } from "../types";
import { actionError } from "./action-result";

const NONE = "__none__";

/**
 * Coordinators assign or reassign each participant's peer navigator (legacy
 * "Create a Coach Relationship"). Changes apply immediately and can be undone
 * from the toast; every change is kept in the history.
 */
export function AssignmentBoard({
  rows: initialRows,
  coaches,
  history,
  timezone,
}: {
  rows: AssignmentRow[];
  coaches: PersonRef[];
  history: AssignmentEvent[];
  timezone: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [lastServer, setLastServer] = useState(initialRows);
  if (initialRows !== lastServer) {
    setLastServer(initialRows);
    setRows(initialRows);
  }

  const unassigned = rows.filter((r) => !r.coach).length;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) => (!unassignedOnly || !r.coach) && (!q || [r.name, r.username, r.coach?.name ?? ""].some((f) => f.toLowerCase().includes(q))),
    );
  }, [rows, query, unassignedOnly]);

  async function change(row: AssignmentRow, coachId: string | null, undo = false) {
    const previous = row.coach;
    const next = coachId ? (coaches.find((c) => c.id === coachId) ?? null) : null;
    setBusy(row.id);
    setRows((list) => list.map((r) => (r.id === row.id ? { ...r, coach: next } : r)));
    const result = await assignCoach({ participantId: row.id, coachId });
    setBusy(null);
    const error = actionError(result);
    if (error) {
      setRows((list) => list.map((r) => (r.id === row.id ? { ...r, coach: previous } : r)));
      toast.error(error);
      return;
    }
    router.refresh();
    if (undo) return;
    toast.success(next ? `${row.name} is now with ${next.name}` : `${row.name} no longer has a coach`, {
      description: next ? "They've both been notified." : undefined,
      action: { label: "Undo", onClick: () => void change({ ...row, coach: next }, previous?.id ?? null, true) },
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="min-w-0 rounded-2xl border bg-card shadow-soft">
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <div className="relative min-w-56 flex-1">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search participants or coaches"
              aria-label="Search participants or coaches"
              className="h-9 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
            />
          </div>
          <button
            type="button"
            aria-pressed={unassignedOnly}
            onClick={() => setUnassignedOnly((v) => !v)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              unassignedOnly ? "border-transparent bg-secondary font-medium text-secondary-foreground" : "hover:bg-muted",
            )}
          >
            <UserRoundX aria-hidden className="size-4" />
            Needs a coach
            <span className="rounded-full bg-background/70 px-1.5 text-xs tabular-nums">{unassigned}</span>
          </button>
        </div>
        {filtered.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 font-medium">Participant</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Peer navigator</th>
                  <th scope="col" className="px-4 py-2.5 font-medium max-md:hidden">Sessions</th>
                  <th scope="col" className="px-4 py-2.5 font-medium max-lg:hidden">Last change</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <UserAvatar userId={row.id} name={row.name} size="sm" />
                        <div className="min-w-0">
                          <Link href={`/coach/${row.id}`} className="block truncate font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
                            {row.name}
                          </Link>
                          <span className="block truncate text-xs text-muted-foreground">
                            @{row.username}
                            {row.blocked ? " · blocked" : ""}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Select value={row.coach?.id ?? NONE} onValueChange={(value) => void change(row, value === NONE ? null : value)} disabled={busy === row.id}>
                          <SelectTrigger className={cn("h-9 w-52", !row.coach && "text-muted-foreground")} aria-label={`Peer navigator for ${row.name}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {coaches.map((coach) => (
                              <SelectItem key={coach.id} value={coach.id}>
                                {coach.name}
                              </SelectItem>
                            ))}
                            <SelectSeparator />
                            <SelectItem value={NONE}>No coach</SelectItem>
                          </SelectContent>
                        </Select>
                        {busy === row.id ? <Spinner className="size-4" /> : null}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums max-md:hidden">{row.completed}/6</td>
                    <td className="px-4 py-2.5 text-muted-foreground max-lg:hidden">{row.assignedAt ? shortAgo(row.assignedAt, timezone) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {rows.length ? "No one matches your filters." : "There are no Peer Navigation participants yet."}
          </p>
        )}
      </section>

      <aside className="rounded-2xl border bg-card p-5 shadow-soft xl:self-start">
        <h2 className="text-base font-semibold">Recent changes</h2>
        {history.length ? (
          <ol className="mt-3 space-y-3">
            {history.map((event) => (
              <li key={event.id} className="text-sm">
                <p>
                  <span className="font-medium">{event.participant?.name ?? "A participant"}</span>
                  <span className="text-muted-foreground"> {event.previousCoach ? `${event.previousCoach.name} ` : ""}</span>
                  {event.previousCoach ? <ArrowRight aria-label="to" className="inline size-3.5 text-muted-foreground" /> : <span className="text-muted-foreground">→</span>}
                  <span className="font-medium"> {event.coach?.name ?? "no coach"}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {friendlyDate(event.createdAt, timezone)}
                  {event.assignedBy ? ` · by ${event.assignedBy.name}` : ""}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Assignments you make will be listed here.</p>
        )}
      </aside>
    </div>
  );
}
