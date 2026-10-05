"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { CheckCheck, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { TimeAgo } from "@/features/admin/components/bits";
import { DataTable, type AdminColumn } from "@/features/admin/components/data-table";
import { runAction } from "@/features/admin/components/run-action";
import { cn } from "@/lib/utils";
import { markInboundReadAction } from "../actions";
import { maskPhone } from "../phone";
import type { InboundRow } from "../types";

const KIND: Record<InboundRow["kind"], { label: string; className: string }> = {
  stop: { label: "Opted out", className: "bg-destructive/10 text-destructive" },
  start: { label: "Opted back in", className: "bg-success/12 text-foreground" },
  help: { label: "Asked for help", className: "bg-brand-sky/15 text-foreground" },
  message: { label: "Reply", className: "bg-secondary text-secondary-foreground" },
};

export function Replies({ rows, timezone }: { rows: InboundRow[]; timezone: string }) {
  const router = useRouter();
  const columns = useMemo<AdminColumn<InboundRow>[]>(
    () => [
      {
        id: "at",
        accessorFn: (row) => row.receivedAt,
        header: "Received",
        cell: ({ row }) => (
          <span className={cn("flex items-center gap-2", !row.original.read && row.original.kind === "message" && "font-medium")}>
            {!row.original.read && row.original.kind === "message" ? <span className="size-2 rounded-full bg-brand-magenta" aria-label="Unread" /> : null}
            <TimeAgo date={row.original.receivedAt} timezone={timezone} />
          </span>
        ),
      },
      {
        id: "from",
        accessorFn: (row) => row.name ?? "",
        header: "From",
        cell: ({ row }) =>
          row.original.userId ? (
            <Link href={`/admin/users/${row.original.userId}`} className="group block rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              <span className="block font-medium group-hover:text-primary group-hover:underline group-hover:underline-offset-4">{row.original.name}</span>
              <span className="block text-xs text-muted-foreground tabular-nums">{row.original.studyId ?? maskPhone(row.original.from)}</span>
            </Link>
          ) : (
            <span className="text-muted-foreground">Unknown number {maskPhone(row.original.from)}</span>
          ),
      },
      {
        id: "body",
        accessorFn: (row) => row.body,
        enableSorting: false,
        header: "Message",
        cell: ({ row }) => <p className="max-w-xl text-sm whitespace-pre-wrap">{row.original.body || <span className="text-muted-foreground">(empty)</span>}</p>,
      },
      {
        id: "kind",
        accessorFn: (row) => row.kind,
        header: "Type",
        cell: ({ row }) => (
          <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap", KIND[row.original.kind].className)}>
            {KIND[row.original.kind].label}
          </span>
        ),
      },
    ],
    [timezone],
  );

  return (
    <DataTable
      data={rows}
      columns={columns}
      noun={["reply", "replies"]}
      searchText={(row) => `${row.name ?? ""} ${row.studyId ?? ""} ${row.body}`}
      searchPlaceholder="Search replies"
      initialSorting={[{ id: "at", desc: true }]}
      rowClassName={(row) => (!row.read && row.kind === "message" ? "bg-brand-magenta/[0.03]" : undefined)}
      bulkActions={(selected, clear) => (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const data = await runAction(markInboundReadAction({ ids: selected.map((row) => row.id) }), "Marked as read");
            if (data) {
              clear();
              router.refresh();
            }
          }}
        >
          <CheckCheck /> Mark as read
        </Button>
      )}
      empty={
        <Empty className="py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox />
            </EmptyMedia>
            <EmptyTitle>No replies yet</EmptyTitle>
            <EmptyDescription>
              When someone texts the study number back, it shows up here. STOP and START are handled automatically.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
    />
  );
}
