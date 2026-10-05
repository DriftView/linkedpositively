"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { BellOff, Ban, HeartHandshake, ShieldCheck, UserRoundCog, UsersRound } from "lucide-react";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Role } from "@/server/auth/roles";
import type { UserRow } from "../types";
import { USER_VIEWS, type UserView } from "../user-views";
import { RoleBadges, StatusDot, TimeAgo, WeekProgress } from "./bits";
import { AssignCoachDialog, DeactivateButton, ReactivateButton, StudyRolesDialog } from "./bulk-dialogs";
import { DataTable, type AdminColumn } from "./data-table";


const STAFF: Role[] = ["admin", "research_admin", "coordinator", "coach"];

function inView(row: UserRow, view: UserView) {
  switch (view) {
    case "participants":
      // Legacy "Manage Participants": participants and eCoach users.
      return !row.banned && (row.roles.includes("participant") || row.roles.includes("ecoach_user"));
    case "control":
      return !row.banned && row.roles.includes("control");
    case "staff":
      return !row.banned && row.roles.some((role) => STAFF.includes(role));
    case "deactivated":
      return row.banned;
    default:
      return true;
  }
}

export function UsersTable({
  rows,
  coaches,
  timezone,
  view,
  program,
  can,
}: {
  rows: UserRow[];
  coaches: { id: string; name: string }[];
  timezone: string;
  view: UserView;
  program: "all" | "lp" | "peernav";
  can: { randomize: boolean; edit: boolean; assignCoach: boolean };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string, fallback: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === fallback) params.delete(key);
    else params.set(key, value);
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
  }

  const counts = useMemo(() => Object.fromEntries(USER_VIEWS.map((v) => [v.id, rows.filter((row) => inView(row, v.id)).length])), [rows]);
  const data = useMemo(
    () => rows.filter((row) => inView(row, view) && (program === "all" || row.programs.includes(program))),
    [rows, view, program],
  );

  const columns = useMemo<AdminColumn<UserRow>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => row.name.toLowerCase(),
        header: "Person",
        cell: ({ row }) => {
          const user = row.original;
          return (
            <Link href={`/admin/users/${user.id}`} className="group flex min-w-52 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              <UserAvatar userId={user.id} name={user.name} size="sm" />
              <span className="min-w-0">
                <span className="block truncate font-medium group-hover:text-primary group-hover:underline group-hover:underline-offset-4">{user.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  @{user.username} · {user.email}
                </span>
              </span>
            </Link>
          );
        },
      },
      {
        id: "studyId",
        accessorFn: (row) => row.studyId ?? "",
        header: "Study ID",
        sortFn: "alphanumeric",
        cell: ({ row }) =>
          row.original.studyId ? (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums">{row.original.studyId}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "roles",
        accessorFn: (row) => row.roleLabel,
        header: "Roles",
        cell: ({ row }) => <RoleBadges roles={row.original.roles} />,
      },
      {
        id: "week",
        accessorFn: (row) => row.studyWeek ?? -1,
        header: "Study week",
        cell: ({ row }) => (
          <span className="flex items-center gap-2 whitespace-nowrap">
            <WeekProgress week={row.original.studyWeek} />
            {row.original.smsOptOut ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <BellOff className="size-3.5 text-muted-foreground" aria-label="Opted out of texts" />
                </TooltipTrigger>
                <TooltipContent>Opted out of study texts</TooltipContent>
              </Tooltip>
            ) : null}
          </span>
        ),
      },
      {
        id: "coach",
        accessorFn: (row) => row.coachName ?? "",
        header: "Peer navigator",
        cell: ({ row }) => row.original.coachName ?? <span className="text-muted-foreground">—</span>,
      },
      {
        id: "lastLogin",
        accessorFn: (row) => row.lastLoginAt ?? "",
        header: "Last sign-in",
        cell: ({ row }) => <TimeAgo date={row.original.lastLoginAt} timezone={timezone} fallback="Never" />,
      },
      {
        id: "status",
        accessorFn: (row) => (row.banned ? 1 : 0),
        header: "Status",
        cell: ({ row }) => (row.original.banned ? <StatusDot tone="destructive">Deactivated</StatusDot> : <StatusDot tone="success">Active</StatusDot>),
      },
    ],
    [timezone],
  );

  const emptyCopy: Record<UserView, { title: string; body: string }> = {
    all: { title: "No accounts yet", body: "Create the first participant to get started." },
    participants: { title: "No participants yet", body: "Convert control accounts on the Randomization page to start the program." },
    control: { title: "No control accounts", body: "New accounts start here until they are randomized." },
    staff: { title: "No staff accounts", body: "Give someone a staff role from their page." },
    deactivated: { title: "Nobody is deactivated", body: "Accounts that are blocked — by staff or at the end of the study — show up here." },
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={view} onValueChange={(value) => setParam("view", value, "all")}>
          <TabsList>
            {USER_VIEWS.map((option) => (
              <TabsTrigger key={option.id} value={option.id} className="gap-1.5">
                {option.label}
                <span className="rounded-full bg-muted px-1.5 text-[0.7rem] text-muted-foreground tabular-nums">
                  {counts[option.id]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <DataTable
        data={data}
        columns={columns}
        noun={["person", "people"]}
        searchText={(row) => `${row.name} ${row.username} ${row.email} ${row.studyId ?? ""} ${row.coachName ?? ""}`}
        searchPlaceholder="Search name, email or study ID"
        initialSorting={[]}
        columnClassNames={{ coach: "hidden xl:table-cell", lastLogin: "hidden lg:table-cell" }}
        toolbar={
          <Select value={program} onValueChange={(value) => setParam("program", value, "all")}>
            <SelectTrigger className="w-44 bg-card data-[size=default]:h-9" aria-label="Program">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All programs</SelectItem>
              <SelectItem value="lp">Link Positively</SelectItem>
              <SelectItem value="peernav">Peer Navigation</SelectItem>
            </SelectContent>
          </Select>
        }
        bulkActions={
          can.randomize || can.edit || can.assignCoach
            ? (selected, clear) => {
                const active = selected.filter((row) => !row.banned);
                const inactive = selected.filter((row) => row.banned);
                return (
                  <>
                    {can.randomize && active.length ? (
                      <StudyRolesDialog
                        people={active}
                        onDone={clear}
                        trigger={
                          <Button variant="outline" size="sm">
                            <UserRoundCog /> Study roles
                          </Button>
                        }
                      />
                    ) : null}
                    {can.assignCoach && active.length ? (
                      <AssignCoachDialog
                        people={active}
                        coaches={coaches}
                        onDone={clear}
                        trigger={
                          <Button variant="outline" size="sm">
                            <HeartHandshake /> Peer navigator
                          </Button>
                        }
                      />
                    ) : null}
                    {can.edit && active.length ? (
                      <DeactivateButton
                        people={active}
                        onDone={clear}
                        trigger={
                          <Button variant="destructive" size="sm">
                            <Ban /> Deactivate
                          </Button>
                        }
                      />
                    ) : null}
                    {can.edit && inactive.length ? (
                      <ReactivateButton
                        people={inactive}
                        onDone={clear}
                        trigger={
                          <Button variant="outline" size="sm">
                            <ShieldCheck /> Reactivate
                          </Button>
                        }
                      />
                    ) : null}
                  </>
                );
              }
            : undefined
        }
        empty={
          <Empty className="py-14">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersRound />
              </EmptyMedia>
              <EmptyTitle>{emptyCopy[view].title}</EmptyTitle>
              <EmptyDescription>{emptyCopy[view].body}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />
    </div>
  );
}
