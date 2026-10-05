"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MessageSquareText, MousePointerClick } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DataTable, type AdminColumn } from "@/features/admin/components/data-table";
import { formatInZone } from "@/lib/dates";
import { reasonLabel, type SendLogRow } from "../types";
import { SendRowActions } from "./send-row-actions";
import { flagLabel, SendStatusBadge } from "./send-status";

type Filter = "all" | "upcoming" | "sent" | "problems";

export function SendLog({ rows, canManage }: { rows: SendLogRow[]; canManage: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [flag, setFlag] = useState("all");

  const counts = useMemo(
    () => ({
      all: rows.length,
      upcoming: rows.filter((row) => row.status === "scheduled").length,
      sent: rows.filter((row) => row.status === "sent").length,
      problems: rows.filter((row) => ["failed", "skipped", "cancelled"].includes(row.status)).length,
    }),
    [rows],
  );
  const flags = useMemo(() => [...new Set(rows.map((row) => row.flag))].sort((a, b) => (a === "WELCOME" ? -1 : b === "WELCOME" ? 1 : a.localeCompare(b, undefined, { numeric: true }))), [rows]);

  const data = useMemo(
    () =>
      rows.filter((row) => {
        if (flag !== "all" && row.flag !== flag) return false;
        if (filter === "upcoming") return row.status === "scheduled";
        if (filter === "sent") return row.status === "sent";
        if (filter === "problems") return ["failed", "skipped", "cancelled"].includes(row.status);
        return true;
      }),
    [rows, filter, flag],
  );

  const columns = useMemo<AdminColumn<SendLogRow>[]>(
    () => [
      {
        id: "when",
        accessorFn: (row) => row.sentAt ?? row.scheduledFor,
        header: "When (their time)",
        cell: ({ row }) => {
          const at = row.original.sentAt ?? row.original.scheduledFor;
          return (
            <span className="whitespace-nowrap tabular-nums" title={row.original.timezone}>
              {formatInZone(at, "EEE MMM d, h:mm a", row.original.timezone)}
            </span>
          );
        },
      },
      {
        id: "name",
        accessorFn: (row) => row.name.toLowerCase(),
        header: "Participant",
        cell: ({ row }) => (
          <Link href={`/admin/users/${row.original.userId}`} className="group block min-w-36 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            <span className="block font-medium group-hover:text-primary group-hover:underline group-hover:underline-offset-4">{row.original.name}</span>
            {row.original.studyId ? <span className="block text-xs text-muted-foreground tabular-nums">{row.original.studyId}</span> : null}
          </Link>
        ),
      },
      {
        id: "flag",
        accessorFn: (row) => row.week,
        header: "Message",
        cell: ({ row }) => (
          <span className="block max-w-md">
            <span className="block font-medium">{flagLabel(row.original.flag)}</span>
            {row.original.body ? <span className="line-clamp-1 text-xs text-muted-foreground">{row.original.body}</span> : null}
          </span>
        ),
      },
      {
        id: "status",
        accessorFn: (row) => row.status,
        header: "Status",
        cell: ({ row }) => (
          <span className="flex flex-col items-start gap-0.5">
            <SendStatusBadge status={row.original.status} />
            {row.original.reason ? <span className="text-xs whitespace-nowrap text-muted-foreground">{reasonLabel(row.original.reason)}</span> : null}
          </span>
        ),
      },
      {
        id: "opened",
        accessorFn: (row) => row.clicks,
        header: "Opened",
        cell: ({ row }) =>
          row.original.clickedAt ? (
            <span className="inline-flex items-center gap-1 text-sm">
              <MousePointerClick className="size-3.5 text-primary" aria-hidden />
              {row.original.clicks > 1 ? `${row.original.clicks}×` : "Yes"}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      ...(canManage
        ? [
            {
              id: "actions",
              enableSorting: false,
              header: () => <span className="sr-only">Actions</span>,
              cell: ({ row }) => <SendRowActions id={row.original.id} flag={row.original.flag} status={row.original.status} name={row.original.name} />,
            } satisfies AdminColumn<SendLogRow>,
          ]
        : []),
    ],
    [canManage],
  );

  return (
    <DataTable
      data={data}
      columns={columns}
      noun={["message", "messages"]}
      searchText={(row) => `${row.name} ${row.studyId ?? ""} ${flagLabel(row.flag)}`}
      searchPlaceholder="Search participant or study ID"
      initialSorting={[{ id: "when", desc: true }]}
      columnClassNames={{ opened: "hidden md:table-cell", actions: "w-12 text-right" }}
      toolbar={
        <>
          <ToggleGroup type="single" value={filter} onValueChange={(value) => value && setFilter(value as Filter)} variant="outline" size="sm" className="bg-card">
            <ToggleGroupItem value="all">All {counts.all}</ToggleGroupItem>
            <ToggleGroupItem value="upcoming">Next 14 days {counts.upcoming}</ToggleGroupItem>
            <ToggleGroupItem value="sent">Sent {counts.sent}</ToggleGroupItem>
            <ToggleGroupItem value="problems">Problems {counts.problems}</ToggleGroupItem>
          </ToggleGroup>
          <Select value={flag} onValueChange={setFlag}>
            <SelectTrigger className="w-36 bg-card data-[size=default]:h-9" aria-label="Message">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All messages</SelectItem>
              {flags.map((value) => (
                <SelectItem key={value} value={value}>
                  {flagLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      }
      empty={
        <Empty className="py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageSquareText />
            </EmptyMedia>
            <EmptyTitle>{filter === "problems" ? "No problems — every text went out" : "No texts here yet"}</EmptyTitle>
            <EmptyDescription>Texts are planned when someone is converted to participant on the Randomization page.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
    />
  );
}
