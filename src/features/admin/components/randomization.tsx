"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { ArrowRightLeft, FlaskConical, Sparkles, Undo2, UserRoundCog } from "lucide-react";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { convertToControlAction, convertToParticipantAction } from "../actions";
import type { UserRow } from "../types";
import { ConfirmAction, DateText, RoleBadges, TimeAgo, WeekProgress } from "./bits";
import { peopleNames, StudyRolesDialog } from "./bulk-dialogs";
import { DataTable, type AdminColumn } from "./data-table";
import { plural, runAction } from "./run-action";

function personColumn(): AdminColumn<UserRow> {
  return {
    id: "name",
    accessorFn: (row) => row.name.toLowerCase(),
    header: "Person",
    cell: ({ row }) => (
      <Link href={`/admin/users/${row.original.id}`} className="group flex min-w-48 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        <UserAvatar userId={row.original.id} name={row.original.name} size="sm" />
        <span className="min-w-0">
          <span className="block truncate font-medium group-hover:text-primary group-hover:underline group-hover:underline-offset-4">{row.original.name}</span>
          <span className="block truncate text-xs text-muted-foreground">@{row.original.username}</span>
        </span>
      </Link>
    ),
  };
}

const studyIdColumn: AdminColumn<UserRow> = {
  id: "studyId",
  accessorFn: (row) => row.studyId ?? "",
  header: "Study ID",
  sortFn: "alphanumeric",
  cell: ({ row }) =>
    row.original.studyId ? <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums">{row.original.studyId}</span> : <span className="text-muted-foreground">—</span>,
};

export function Randomization({
  control,
  participants,
  timezone,
}: {
  control: UserRow[];
  participants: UserRow[];
  timezone: string;
}) {
  const router = useRouter();

  const controlColumns = useMemo<AdminColumn<UserRow>[]>(
    () => [
      personColumn(),
      studyIdColumn,
      { id: "roles", accessorFn: (row) => row.roleLabel, header: "Roles", cell: ({ row }) => <RoleBadges roles={row.original.roles} /> },
      {
        id: "phone",
        accessorFn: (row) => (row.hasPhone ? 1 : 0),
        header: "Texts",
        cell: ({ row }) =>
          row.original.hasPhone ? <span className="text-sm">Ready</span> : <span className="text-sm text-warning-foreground dark:text-warning">No number</span>,
      },
      {
        id: "created",
        accessorFn: (row) => row.createdAt,
        header: "Joined",
        cell: ({ row }) => <DateText date={row.original.createdAt} timezone={timezone} pattern="MMM d, yyyy" />,
      },
      {
        id: "lastLogin",
        accessorFn: (row) => row.lastLoginAt ?? "",
        header: "Last sign-in",
        cell: ({ row }) => <TimeAgo date={row.original.lastLoginAt} timezone={timezone} fallback="Never" />,
      },
    ],
    [timezone],
  );

  const participantColumns = useMemo<AdminColumn<UserRow>[]>(
    () => [
      personColumn(),
      studyIdColumn,
      {
        id: "start",
        accessorFn: (row) => row.interventionStartDate ?? "",
        header: "Started",
        cell: ({ row }) => <DateText date={row.original.interventionStartDate} timezone={timezone} pattern="MMM d, yyyy" />,
      },
      { id: "week", accessorFn: (row) => row.studyWeek ?? -1, header: "Study week", cell: ({ row }) => <WeekProgress week={row.original.studyWeek} /> },
      { id: "roles", accessorFn: (row) => row.roleLabel, header: "Roles", cell: ({ row }) => <RoleBadges roles={row.original.roles} /> },
      {
        id: "lastLogin",
        accessorFn: (row) => row.lastLoginAt ?? "",
        header: "Last sign-in",
        cell: ({ row }) => <TimeAgo date={row.original.lastLoginAt} timezone={timezone} fallback="Never" />,
      },
    ],
    [timezone],
  );

  return (
    <div className="space-y-10">
      <section aria-labelledby="control-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="control-heading" className="flex items-center gap-2 text-lg font-semibold">
              <FlaskConical className="size-4.5 text-muted-foreground" aria-hidden /> Control accounts
            </h2>
            <p className="text-sm text-muted-foreground">Select the people randomized to the intervention and convert them.</p>
          </div>
        </div>
        <DataTable
          data={control}
          columns={controlColumns}
          noun={["account", "accounts"]}
          searchText={(row) => `${row.name} ${row.username} ${row.studyId ?? ""}`}
          searchPlaceholder="Search name or study ID"
          initialSorting={[{ id: "created", desc: true }]}
          pageSize={25}
          bulkActions={(selected, clear) => (
            <>
              <ConfirmAction
                trigger={
                  <Button size="sm">
                    <Sparkles /> Convert to participant
                  </Button>
                }
                title={`Start the intervention for ${plural(selected.length, "person", "people")}?`}
                description={
                  <>
                    <p>{peopleNames(selected)} will move from control to participant. For each of them:</p>
                    <ul className="list-disc space-y-1 pl-5">
                      <li>week 1 starts today (in their timezone),</li>
                      <li>the welcome text goes out in 15 minutes, then one text a week for 24 weeks,</li>
                      <li>they get an email that their account is ready.</li>
                    </ul>
                    {selected.some((row) => !row.hasPhone) ? (
                      <p className="text-warning-foreground dark:text-warning">
                        {plural(selected.filter((row) => !row.hasPhone).length, "person has", "people have")} no mobile number, so their texts will be skipped.
                      </p>
                    ) : null}
                  </>
                }
                confirmLabel="Convert"
                onConfirm={async () => {
                  const data = await runAction(convertToParticipantAction({ ids: selected.map((row) => row.id) }), (result) =>
                    `${plural(result.count, "person", "people")} started the intervention`,
                  );
                  if (!data) return false;
                  clear();
                  router.refresh();
                }}
              />
              <StudyRolesDialog
                people={selected}
                onDone={clear}
                trigger={
                  <Button variant="outline" size="sm">
                    <UserRoundCog /> Study roles
                  </Button>
                }
              />
            </>
          )}
          empty={
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ArrowRightLeft />
                </EmptyMedia>
                <EmptyTitle>Everyone has been randomized</EmptyTitle>
                <EmptyDescription>New accounts land here in the control arm. <Link href="/admin/users/new">Create a participant</Link>.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          }
        />
      </section>

      <section aria-labelledby="converted-heading" className="space-y-3">
        <div>
          <h2 id="converted-heading" className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="size-4.5 text-primary" aria-hidden /> Participants
          </h2>
          <p className="text-sm text-muted-foreground">Most recently converted first. Move someone back if they were converted by mistake.</p>
        </div>
        <DataTable
          data={participants}
          columns={participantColumns}
          noun={["participant", "participants"]}
          searchText={(row) => `${row.name} ${row.username} ${row.studyId ?? ""}`}
          searchPlaceholder="Search participants"
          hotkey={false}
          initialSorting={[{ id: "start", desc: true }]}
          pageSize={10}
          bulkActions={(selected, clear) => (
            <>
              <ConfirmAction
                trigger={
                  <Button variant="outline" size="sm">
                    <Undo2 /> Move back to control
                  </Button>
                }
                destructive
                title={`Move ${plural(selected.length, "participant", "participants")} back to control?`}
                description={
                  <>
                    <p>{peopleNames(selected)} will lose access to the intervention features. Their upcoming study texts are cancelled.</p>
                    <p>Their history (points, posts, texts already sent) is kept.</p>
                  </>
                }
                confirmLabel="Move to control"
                onConfirm={async () => {
                  const data = await runAction(convertToControlAction({ ids: selected.map((row) => row.id) }), (result) =>
                    `${plural(result.count, "person", "people")} moved back to control`,
                  );
                  if (!data) return false;
                  clear();
                  router.refresh();
                }}
              />
              <StudyRolesDialog
                people={selected}
                onDone={clear}
                trigger={
                  <Button variant="outline" size="sm">
                    <UserRoundCog /> Study roles
                  </Button>
                }
              />
            </>
          )}
          empty={
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyTitle>No participants yet</EmptyTitle>
                <EmptyDescription>Convert control accounts above to start the program.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          }
        />
      </section>
    </div>
  );
}
