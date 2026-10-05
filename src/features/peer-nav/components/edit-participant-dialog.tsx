"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { updateParticipantDetails } from "../actions";
import type { ParticipantDetail } from "../types";
import { actionError } from "./action-result";

type FormState = {
  name: string;
  pronouns: string;
  location: string;
  age: string;
  onPrep: "yes" | "no" | "";
  studyId: string;
  participantCode: string;
};

function initial(p: ParticipantDetail): FormState {
  return {
    name: p.name,
    pronouns: p.pronouns ?? "",
    location: p.location ?? "",
    age: p.age === null ? "" : String(p.age),
    onPrep: p.onPrep === null ? "" : p.onPrep ? "yes" : "no",
    studyId: p.studyId ?? "",
    participantCode: p.participantCode ?? "",
  };
}

/** "Edit participant" (legacy /profile/{uid}). The login username is shown but not editable. */
export function EditParticipantDialog({ participant, trigger }: { participant: ParticipantDetail; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => initial(participant));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const ageInvalid = form.age !== "" && (!/^\d{1,3}$/.test(form.age) || Number(form.age) > 120);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (ageInvalid) return;
    setError(null);
    startTransition(async () => {
      const result = await updateParticipantDetails({
        participantId: participant.id,
        name: form.name,
        pronouns: form.pronouns,
        location: form.location,
        age: form.age === "" ? null : Number(form.age),
        onPrep: form.onPrep === "" ? null : form.onPrep === "yes",
        studyId: form.studyId,
        participantCode: form.participantCode,
      });
      const message = actionError(result);
      if (message) {
        setError(message);
        return;
      }
      toast.success("Participant details updated");
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setForm(initial(participant));
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="lg">
            <Pencil aria-hidden />
            Edit participant
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Edit participant</DialogTitle>
            <DialogDescription>
              Username <span className="font-medium text-foreground">@{participant.username}</span> is used to sign in and can&apos;t be changed here.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="my-5 gap-4">
            <Field>
              <FieldLabel htmlFor="pn-name">Name</FieldLabel>
              <Input id="pn-name" value={form.name} onChange={set("name")} required maxLength={80} autoComplete="off" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="pn-pronouns">Pronouns</FieldLabel>
                <Input id="pn-pronouns" value={form.pronouns} onChange={set("pronouns")} maxLength={60} placeholder="e.g. they/them" />
              </Field>
              <Field data-invalid={ageInvalid || undefined}>
                <FieldLabel htmlFor="pn-age">Age</FieldLabel>
                <Input
                  id="pn-age"
                  inputMode="numeric"
                  value={form.age}
                  onChange={set("age")}
                  aria-invalid={ageInvalid || undefined}
                  aria-describedby={ageInvalid ? "pn-age-error" : undefined}
                  maxLength={3}
                />
                {ageInvalid ? (
                  <FieldDescription id="pn-age-error" className="text-destructive">
                    Enter a whole number up to 120.
                  </FieldDescription>
                ) : null}
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="pn-location">Location</FieldLabel>
              <Input id="pn-location" value={form.location} onChange={set("location")} maxLength={120} />
            </Field>
            <Field>
              <FieldLabel id="pn-prep-label">On PrEP?</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                aria-labelledby="pn-prep-label"
                value={form.onPrep}
                onValueChange={(value) => setForm((f) => ({ ...f, onPrep: (value as FormState["onPrep"]) ?? "" }))}
                spacing={0}
              >
                <ToggleGroupItem value="yes" className="px-4">Yes</ToggleGroupItem>
                <ToggleGroupItem value="no" className="px-4">No</ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>Select an option again to clear it.</FieldDescription>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="pn-study">Study ID</FieldLabel>
                <Input id="pn-study" value={form.studyId} onChange={set("studyId")} maxLength={60} autoComplete="off" />
              </Field>
              <Field>
                <FieldLabel htmlFor="pn-code">Participant code</FieldLabel>
                <Input id="pn-code" value={form.participantCode} onChange={set("participantCode")} maxLength={60} autoComplete="off" />
              </Field>
            </div>
            {error ? (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={pending || !form.name.trim() || ageInvalid}>
              {pending ? <Spinner /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
