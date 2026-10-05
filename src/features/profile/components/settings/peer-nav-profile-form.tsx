"use client";

import { Check, Video } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { updatePeerNavProfile } from "../../actions";
import { Field } from "./account-form";

type Values = { firstName: string; pronouns: string; location: string; aboutMe: string; zoomLink: string };

/**
 * Peer Navigation profile (legacy PN user fields). Peer navigators also set
 * the meeting link their participants use to join sessions.
 */
export function PeerNavProfileForm({ initial, isCoach }: { initial: Values; isCoach: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const { executeAsync, isPending } = useAction(updatePeerNavProfile);
  const dirty = (Object.keys(values) as (keyof Values)[]).some((key) => values[key].trim() !== saved[key]);
  const set = (key: keyof Values) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const link = values.zoomLink.trim();
    if (isCoach && link && !/^https:\/\/\S+$/i.test(link)) {
      setError("Use a full link that starts with https://");
      return;
    }
    setError(null);
    const result = await executeAsync({
      firstName: values.firstName,
      pronouns: values.pronouns,
      location: values.location,
      aboutMe: values.aboutMe,
      zoomLink: isCoach ? link : "",
    });
    if (!result?.data) {
      const message = result?.serverError ?? result?.validationErrors?.zoomLink?._errors?.[0] ?? "We couldn't save your profile.";
      toast.error(message);
      return;
    }
    const trimmed = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()])) as Values;
    setSaved(trimmed);
    setValues(trimmed);
    toast.success("Your profile is saved.");
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-3">
        <Field id="pn-first-name" label="First name">
          <Input id="pn-first-name" value={values.firstName} onChange={set("firstName")} maxLength={80} autoComplete="given-name" className="h-11 rounded-xl" />
        </Field>
        <Field id="pn-pronouns" label="Pronouns">
          <Input id="pn-pronouns" value={values.pronouns} onChange={set("pronouns")} maxLength={60} placeholder="e.g. she/her" className="h-11 rounded-xl" />
        </Field>
        <Field id="pn-location" label="Location">
          <Input id="pn-location" value={values.location} onChange={set("location")} maxLength={120} placeholder="City, State" className="h-11 rounded-xl" />
        </Field>
      </div>
      <Field id="pn-about" label="About me" hint={isCoach ? "Participants see this on their “My coach” page." : "Your peer navigator can see this."}>
        <Textarea id="pn-about" value={values.aboutMe} onChange={set("aboutMe")} maxLength={2000} rows={4} className="min-h-28 rounded-xl" />
      </Field>
      {isCoach ? (
        <Field id="pn-zoom" label="Meeting link" error={error ?? undefined} hint="Your personal Zoom (or other video) room for sessions.">
          <div className="relative">
            <Video className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="pn-zoom"
              type="url"
              inputMode="url"
              value={values.zoomLink}
              onChange={set("zoomLink")}
              placeholder="https://zoom.us/j/…"
              className="h-11 rounded-xl pl-9"
              aria-invalid={Boolean(error)}
            />
          </div>
        </Field>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" className="h-11 rounded-full px-6 text-[0.95rem]" disabled={!dirty || isPending}>
          {isPending ? <Spinner /> : <Check />} Save profile
        </Button>
      </div>
    </form>
  );
}
