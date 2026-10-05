"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ScrollText } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatInZone } from "@/lib/dates";
import type { AuditRow } from "../types";
import { DataTable, type AdminColumn } from "./data-table";

const GROUPS = [
  { value: "all", label: "All actions" },
  { value: "user.roles", label: "Role changes" },
  { value: "randomize", label: "Randomization" },
  { value: "block", label: "Blocks & reactivations" },
  { value: "user.impersonate", label: "Impersonation" },
  { value: "user.create", label: "New accounts" },
  { value: "sms", label: "SMS" },
  { value: "survey", label: "Surveys" },
  { value: "settings", label: "Settings" },
];

function matches(action: string, group: string) {
  if (group === "all") return true;
  if (group === "block") return ["user.block", "user.unblock", "user.autoblock"].includes(action);
  return action.startsWith(group);
}

const ACTION_LABEL: Record<string, string> = {
  "user.create": "Account created",
  "user.update": "Details edited",
  "user.roles": "Roles",
  "user.block": "Deactivated",
  "user.unblock": "Reactivated",
  "user.autoblock": "Auto-deactivated",
  "user.passwordLink": "Password link",
  "user.welcomeLink": "Welcome link",
  "user.coach": "Peer navigator",
  "user.impersonate": "Viewed as",
  "user.impersonateStop": "Stopped viewing",
  "randomize.participant": "Randomized",
  "randomize.control": "Back to control",
  "sms.template": "SMS text",
  "sms.test": "SMS test",
  "sms.resend": "SMS re-sent",
  "sms.cancel": "SMS cancelled",
  "sms.optout": "SMS opt-out",
  "survey.config": "Survey settings",
  "survey.sync": "Qualtrics import",
  "survey.complete": "Survey done",
  "settings.update": "Settings",
};

export function AuditTable({ rows, timezone }: { rows: AuditRow[]; timezone: string }) {
  const [group, setGroup] = useState("all");
  const data = useMemo(() => rows.filter((row) => matches(row.action, group)), [rows, group]);
  const columns = useMemo<AdminColumn<AuditRow>[]>(
    () => [
      {
        id: "at",
        accessorFn: (row) => row.at,
        header: "When",
        cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatInZone(row.original.at, "MMM d, yyyy h:mm a", timezone)}</span>,
      },
      {
        id: "actor",
        accessorFn: (row) => row.actorName,
        header: "Who",
        cell: ({ row }) => (
          <span className="block">
            {row.original.actorId ? (
              <Link href={`/admin/users/${row.original.actorId}`} className="font-medium whitespace-nowrap hover:underline">
                {row.original.actorName}
              </Link>
            ) : (
              <span className="text-muted-foreground">{row.original.actorName}</span>
            )}
            {row.original.impersonatedBy ? <span className="block text-xs text-muted-foreground">as seen by {row.original.impersonatedBy}</span> : null}
          </span>
        ),
      },
      {
        id: "action",
        accessorFn: (row) => row.action,
        header: "Action",
        cell: ({ row }) => (
          <span className="inline-flex h-6 items-center rounded-full bg-secondary px-2 text-xs font-medium whitespace-nowrap text-secondary-foreground">
            {ACTION_LABEL[row.original.action] ?? row.original.action}
          </span>
        ),
      },
      { id: "summary", accessorFn: (row) => row.summary, enableSorting: false, header: "What happened", cell: ({ row }) => <span className="block max-w-xl">{row.original.summary}</span> },
      {
        id: "targets",
        accessorFn: (row) => row.targetNames.join(", "),
        header: "People",
        cell: ({ row }) =>
          row.original.targetIds.length ? (
            <span className="flex flex-wrap gap-x-2">
              {row.original.targetNames.map((name, index) => (
                <Link key={row.original.targetIds[index]} href={`/admin/users/${row.original.targetIds[index]}`} className="whitespace-nowrap hover:underline">
                  {name}
                </Link>
              ))}
              {row.original.targetIds.length > 3 ? <span className="text-muted-foreground">+{row.original.targetIds.length - 3}</span> : null}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ],
    [timezone],
  );
  return (
    <DataTable
      data={data}
      columns={columns}
      noun={["entry", "entries"]}
      searchText={(row) => `${row.actorName} ${row.summary} ${row.targetNames.join(" ")}`}
      searchPlaceholder="Search the log"
      initialSorting={[{ id: "at", desc: true }]}
      pageSize={50}
      toolbar={
        <Select value={group} onValueChange={setGroup}>
          <SelectTrigger className="w-52 bg-card data-[size=default]:h-9" aria-label="Filter by action">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUPS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      empty={
        <Empty className="py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ScrollText />
            </EmptyMedia>
            <EmptyTitle>Nothing recorded yet</EmptyTitle>
            <EmptyDescription>Role changes, randomization, blocks, impersonation and settings changes are recorded here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
    />
  );
}
