"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { assignCoachAction, blockUsersAction, setStudyRolesAction, unblockUsersAction } from "../actions";
import { ConfirmAction } from "./bits";
import { plural, runAction } from "./run-action";

type Person = { id: string; name: string };

function names(people: Person[]) {
  const shown = people.slice(0, 3).map((person) => person.name);
  const more = people.length - shown.length;
  return more > 0 ? `${shown.join(", ")} and ${more} more` : shown.join(", ").replace(/, ([^,]*)$/, " and $1");
}

/** Legacy "Change Role" / "Add Study Roles": participant and Peer Navigation. */
export function StudyRolesDialog({ people, onDone, trigger }: { people: Person[]; onDone: () => void; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [participant, setParticipant] = useState(true);
  const [ecoach, setEcoach] = useState(false);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    const data = await runAction(setStudyRolesAction({ ids: people.map((person) => person.id), participant, ecoach }), (result) =>
      result.count ? `Updated study roles for ${plural(result.count, "person", "people")}` : "Nothing needed to change",
    );
    setPending(false);
    if (data) {
      setOpen(false);
      onDone();
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change study roles</DialogTitle>
          <DialogDescription>For {names(people)}. Other roles (staff, peer navigator) are kept.</DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-3">
          <FieldLabel htmlFor="study-participant">
            <Field orientation="horizontal">
              <Checkbox id="study-participant" checked={participant} onCheckedChange={(value) => setParticipant(Boolean(value))} />
              <FieldContent>
                <span className="font-medium">Participant (intervention)</span>
                <FieldDescription>
                  Adding it starts the program today: welcome text in 15 minutes, then a text every week. Removing it moves the person back
                  to control.
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldLabel>
          <FieldLabel htmlFor="study-ecoach">
            <Field orientation="horizontal">
              <Checkbox id="study-ecoach" checked={ecoach} onCheckedChange={(value) => setEcoach(Boolean(value))} />
              <FieldContent>
                <span className="font-medium">Peer Navigation (eCoach)</span>
                <FieldDescription>Opens the Peer Navigation program. Assign a peer navigator too.</FieldDescription>
              </FieldContent>
            </Field>
          </FieldLabel>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? <Spinner /> : null}
            Save for {plural(people.length, "person", "people")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AssignCoachDialog({
  people,
  coaches,
  onDone,
  trigger,
}: {
  people: Person[];
  coaches: { id: string; name: string }[];
  onDone: () => void;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [coachId, setCoachId] = useState<string>("");
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    const data = await runAction(
      assignCoachAction({ ids: people.map((person) => person.id), coachId: coachId === "none" ? null : coachId }),
      (result) => (result.count ? `Updated the peer navigator for ${plural(result.count, "person", "people")}` : "Nothing needed to change"),
    );
    setPending(false);
    if (data) {
      setOpen(false);
      onDone();
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign a peer navigator</DialogTitle>
          <DialogDescription>For {names(people)}.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="coach-select">Peer navigator</FieldLabel>
          <Select value={coachId} onValueChange={setCoachId}>
            <SelectTrigger id="coach-select" className="w-full">
              <SelectValue placeholder="Choose someone" />
            </SelectTrigger>
            <SelectContent>
              {coaches.map((coach) => (
                <SelectItem key={coach.id} value={coach.id}>
                  {coach.name}
                </SelectItem>
              ))}
              <SelectItem value="none">No peer navigator</SelectItem>
            </SelectContent>
          </Select>
          {!coaches.length ? <FieldDescription>No active peer navigators yet. Give someone the peer navigator role first.</FieldDescription> : null}
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || !coachId}>
            {pending ? <Spinner /> : null}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeactivateButton({ people, onDone, trigger }: { people: Person[]; onDone: () => void; trigger: React.ReactNode }) {
  const router = useRouter();
  return (
    <ConfirmAction
      trigger={trigger}
      destructive
      title={`Deactivate ${plural(people.length, "account", "accounts")}?`}
      description={
        <>
          <p>{names(people)} will be signed out and won&apos;t be able to sign in. Their upcoming study texts are cancelled.</p>
          <p>Nothing is deleted — you can reactivate them later.</p>
        </>
      }
      confirmLabel="Deactivate"
      onConfirm={async () => {
        const data = await runAction(blockUsersAction({ ids: people.map((person) => person.id) }), (result) =>
          `Deactivated ${plural(result.count, "account", "accounts")}`,
        );
        if (!data) return false;
        onDone();
        router.refresh();
      }}
    />
  );
}

export function ReactivateButton({ people, onDone, trigger }: { people: Person[]; onDone: () => void; trigger: React.ReactNode }) {
  const router = useRouter();
  return (
    <ConfirmAction
      trigger={trigger}
      title={`Reactivate ${plural(people.length, "account", "accounts")}?`}
      description={<p>{names(people)} will be able to sign in again. Participants&apos; remaining weekly texts are re-planned.</p>}
      confirmLabel="Reactivate"
      onConfirm={async () => {
        const data = await runAction(unblockUsersAction({ ids: people.map((person) => person.id) }), (result) =>
          `Reactivated ${plural(result.count, "account", "accounts")}`,
        );
        if (!data) return false;
        onDone();
        router.refresh();
      }}
    />
  );
}

export { names as peopleNames };
