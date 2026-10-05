"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowRight, Check, GripVertical, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { friendlyDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { reorderSessions, startSession } from "../actions";
import { sessionActionLabel } from "../format";
import type { PlanSession } from "../types";
import { actionError } from "./action-result";
import { StatusPill } from "./bits";

/** Keeps dragged rows on the vertical axis (@dnd-kit/modifiers isn't installed). */
const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/**
 * The participant's six sessions in the coach's order. Drag (or focus the
 * handle, press Space and use ↑/↓) to reorder; the participant's Coaching
 * Plans page follows the same order.
 */
export function SessionPlanEditor({ participantId, sessions, timezone }: { participantId: string; sessions: PlanSession[]; timezone: string }) {
  const router = useRouter();
  const [items, setItems] = useState(sessions);
  const [saving, startSaving] = useTransition();
  const [starting, setStarting] = useState<number | null>(null);
  const dndId = useId();

  // Keep in sync when the server sends fresh data (e.g. after a save elsewhere).
  const [lastServer, setLastServer] = useState(sessions);
  if (sessions !== lastServer) {
    setLastServer(sessions);
    setItems(sessions);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const titleOf = (id: string | number) => items.find((s) => String(s.serial) === String(id))?.title ?? "Session";
  const positionOf = (id: string | number) => items.findIndex((s) => String(s.serial) === String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}. It is in position ${positionOf(active.id)} of ${items.length}.`,
    onDragOver: ({ active, over }) => (over ? `${titleOf(active.id)} moved to position ${positionOf(over.id)} of ${items.length}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `${titleOf(active.id)} dropped at position ${positionOf(over.id)}.` : `${titleOf(active.id)} dropped.`),
    onDragCancel: ({ active }) => `Moving ${titleOf(active.id)} was cancelled.`,
  };

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const previous = items;
    const from = items.findIndex((s) => String(s.serial) === String(active.id));
    const to = items.findIndex((s) => String(s.serial) === String(over.id));
    const next = arrayMove(items, from, to);
    setItems(next);
    startSaving(async () => {
      const result = await reorderSessions({ participantId, order: next.map((s) => s.serial) });
      const error = actionError(result);
      if (error) {
        setItems(previous);
        toast.error(error);
      } else {
        toast.success("Session order saved", { description: "The participant sees the same order." });
      }
    });
  }

  async function start(serial: number) {
    setStarting(serial);
    const result = await startSession({ participantId, serial });
    const error = actionError(result);
    if (error) {
      setStarting(null);
      toast.error(error);
      return;
    }
    router.push(`/coach/${participantId}/sessions/${serial}`);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <p className="text-sm text-muted-foreground">
          Drag sessions to change their order. With a keyboard, focus a handle, press <kbd className="font-sans font-medium">Space</kbd>, then use the arrow keys.
        </p>
        <span className={cn("flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity", saving ? "opacity-100" : "opacity-0")} aria-hidden={!saving}>
          <Spinner className="size-3.5" /> Saving order
        </span>
      </div>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable: "To reorder, press Space or Enter to pick up this session, use the up and down arrow keys to move it, then press Space or Enter again to drop it, or Escape to cancel.",
          },
        }}
      >
        <SortableContext items={items.map((s) => String(s.serial))} strategy={verticalListSortingStrategy}>
          <ol className="relative flex flex-col gap-2.5">
            {items.map((session, index) => (
              <SortableSession
                key={session.serial}
                session={session}
                position={index + 1}
                participantId={participantId}
                timezone={timezone}
                starting={starting === session.serial}
                onStart={() => start(session.serial)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableSession({
  session,
  position,
  participantId,
  timezone,
  starting,
  onStart,
}: {
  session: PlanSession;
  position: number;
  participantId: string;
  timezone: string;
  starting: boolean;
  onStart: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: String(session.serial) });
  const href = `/coach/${participantId}/sessions/${session.serial}`;
  const label = sessionActionLabel(session.status);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative flex items-center gap-3 rounded-2xl border bg-card p-3 pr-4 shadow-soft transition-shadow",
        isDragging && "z-10 shadow-lift ring-2 ring-primary/30",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${session.title}, position ${position}`}
        className="grid h-11 w-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
      >
        <GripVertical aria-hidden className="size-4" />
      </button>
      <span
        aria-hidden
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-xl font-heading text-sm font-semibold tabular-nums",
          session.status === "complete" ? "bg-success/12 text-success" : "bg-secondary text-secondary-foreground",
        )}
      >
        {session.status === "complete" ? <Check className="size-4" strokeWidth={3} /> : position}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">Session {session.serial}</p>
        <h3 className="truncate font-sans text-[0.95rem] font-semibold">{session.title}</h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <StatusPill status={session.status} className="h-5 px-1.5 text-[0.7rem]" />
          {session.lastModifiedAt ? (
            <span>
              Last saved {friendlyDate(session.lastModifiedAt, timezone)} · {session.revisionCount} {session.revisionCount === 1 ? "save" : "saves"}
            </span>
          ) : null}
        </p>
      </div>
      {session.status === "not_started" ? (
        <Button size="lg" onClick={onStart} disabled={starting} className="min-w-24">
          {starting ? <Spinner /> : <Play aria-hidden />}
          Start
        </Button>
      ) : (
        <Button asChild size="lg" variant={session.status === "complete" ? "outline" : "default"} className="min-w-24">
          <Link href={href}>
            {label}
            {session.status === "complete" ? <Check aria-hidden /> : <ArrowRight aria-hidden />}
          </Link>
        </Button>
      )}
    </li>
  );
}
