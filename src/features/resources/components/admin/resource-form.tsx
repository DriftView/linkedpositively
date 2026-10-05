"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Flag, MapPin, MapPinOff, RefreshCw, Save, ShieldCheck, Star, Heart, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { deleteResourcesAction, dismissReportsAction, retryGeocodeAction, saveResourceAction } from "../../admin-actions";
import { actionError, fieldErrors } from "../../client";
import { mapsHref } from "../../lib";
import type { ResourceFormInput } from "../../schemas";
import type { AdminReportDTO } from "../../types";
import { TagInput } from "./tag-input";

type FormValues = Required<Omit<ResourceFormInput, "id">> & { id?: string };

const EMPTY: FormValues = {
  title: "",
  description: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  website: "",
  contact: "",
  hours: "",
  eligibility: "",
  scheduling: "",
  covidUpdates: "",
  insuranceStatus: "",
  services: "",
  tags: [],
  status: "published",
  coordinates: "",
};

const REASON_LABELS: Record<AdminReportDTO["reason"], string> = {
  closed: "Closed or moved",
  wrong_info: "Details are wrong",
  not_helpful: "Not welcoming or helpful",
  other: "Something else",
};

export type ResourceEditData = {
  id: string;
  form: FormValues;
  geocode: { status: "ok" | "pending" | "failed" | "none"; source: string | null; lat: number | null; lng: number | null };
  suggestedByName: string | null;
  reports: AdminReportDTO[];
  stats: { favoriteCount: number; ratingAverage: number; ratingCount: number };
};

/** Create / edit a resource (all Drupal `resources` fields). */
export function ResourceForm({ data, tagSuggestions, geocoding }: { data?: ResourceEditData; tagSuggestions: string[]; geocoding: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(data?.form ?? EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reports, setReports] = useState(data?.reports ?? []);
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };
  const bind = (key: keyof FormValues) => ({
    id: `resource-${key}`,
    value: values[key] as string,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, event.target.value as never),
    "aria-invalid": Boolean(errors[key]),
  });

  function save(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveResourceAction({ ...values, id: data?.id });
      setErrors(fieldErrors(result));
      const error = actionError(result);
      if (error || !result?.data) {
        toast.error(error ?? "Couldn't save.");
        return;
      }
      setDirty(false);
      const geo = result.data.geocodeStatus;
      toast.success(data ? "Resource saved" : "Resource created", {
        description:
          geo === "failed"
            ? "We couldn't find the address on the map. Check it, or add coordinates."
            : geo === "pending"
              ? "It'll appear in distance searches once it has map coordinates."
              : undefined,
      });
      if (!data) router.push(`/admin/content/resources/${result.data.id}`);
      else router.refresh();
    });
  }

  function remove() {
    if (!data) return;
    startTransition(async () => {
      const result = await deleteResourcesAction({ ids: [data.id] });
      const error = actionError(result);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Resource deleted");
      router.push("/admin/content/resources");
    });
  }

  function dismiss() {
    if (!data) return;
    startTransition(async () => {
      const result = await dismissReportsAction({ resourceId: data.id });
      const error = actionError(result);
      if (error) toast.error(error);
      else {
        setReports([]);
        toast.success("Reports dismissed. The resource stays published.");
      }
    });
  }

  function retry() {
    if (!data) return;
    startTransition(async () => {
      const result = await retryGeocodeAction({ resourceId: data.id });
      const error = actionError(result);
      if (error) toast.error(error);
      else {
        toast[result?.data?.status === "ok" ? "success" : "error"](
          result?.data?.status === "ok" ? "Placed on the map" : "Still couldn't find that address",
        );
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={save} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid gap-6">
        <Section title="Basics">
          <Field label="Organization name" htmlFor="resource-title" error={errors.title} required>
            <Input {...bind("title")} maxLength={200} required />
          </Field>
          <Field label="Description" htmlFor="resource-description" hint="One or two sentences shown at the top of the listing.">
            <Textarea {...bind("description")} rows={3} maxLength={5000} />
          </Field>
          <Field label="Tags" htmlFor="resource-tags" hint="Used for the topic filters. Reuse existing tags where you can.">
            <TagInput id="resource-tags" value={values.tags} onChange={(tags) => set("tags", tags)} suggestions={tagSuggestions} />
          </Field>
        </Section>

        <Section title="Location">
          <Field label="Street address" htmlFor="resource-address">
            <Input {...bind("address")} maxLength={300} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem_8rem]">
            <Field label="City" htmlFor="resource-city">
              <Input {...bind("city")} maxLength={120} />
            </Field>
            <Field label="State" htmlFor="resource-state">
              <Input {...bind("state")} maxLength={60} placeholder="MA" />
            </Field>
            <Field label="ZIP" htmlFor="resource-zip">
              <Input {...bind("zip")} maxLength={12} inputMode="numeric" />
            </Field>
          </div>
          <Field
            label="Map pin (optional)"
            htmlFor="resource-coordinates"
            error={errors.coordinates}
            hint={
              geocoding
                ? "Leave empty to find the address on the map automatically. Paste “latitude, longitude” to pin it exactly."
                : "Geocoding isn't set up, so paste “latitude, longitude” (e.g. from Google Maps) for this to show in distance searches."
            }
          >
            <Input {...bind("coordinates")} maxLength={60} placeholder="42.3496, -71.0662" />
          </Field>
          {data ? <GeoStatus geocode={data.geocode} geocoding={geocoding} onRetry={retry} pending={pending} resource={values} /> : null}
        </Section>

        <Section title="Contact & hours">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact" htmlFor="resource-contact" hint="Phone and/or email. Phone numbers become tap-to-call.">
              <Input {...bind("contact")} maxLength={500} />
            </Field>
            <Field label="Website" htmlFor="resource-website" error={errors.website}>
              <Input {...bind("website")} maxLength={500} placeholder="example.org" inputMode="url" />
            </Field>
          </div>
          <Field label="Hours" htmlFor="resource-hours" hint="One line per day or range.">
            <Textarea {...bind("hours")} rows={3} maxLength={2000} />
          </Field>
        </Section>

        <Section title="Details">
          <Field label="Eligibility" htmlFor="resource-eligibility" hint="Who can use it.">
            <Textarea {...bind("eligibility")} rows={3} maxLength={4000} />
          </Field>
          <Field label="Scheduling" htmlFor="resource-scheduling">
            <Textarea {...bind("scheduling")} rows={3} maxLength={4000} />
          </Field>
          <Field label="Insurance status" htmlFor="resource-insuranceStatus">
            <Textarea {...bind("insuranceStatus")} rows={3} maxLength={4000} />
          </Field>
          <Field label="Covid-19 updates" htmlFor="resource-covidUpdates">
            <Textarea {...bind("covidUpdates")} rows={2} maxLength={4000} />
          </Field>
          <Field label="Other services" htmlFor="resource-services">
            <Textarea {...bind("services")} rows={2} maxLength={4000} />
          </Field>
        </Section>
      </div>

      <aside className="grid gap-4 lg:sticky lg:top-6">
        <div className="rounded-xl border bg-card p-4">
          <Label htmlFor="resource-status" className="mb-2 block">
            Status
          </Label>
          <Select value={values.status} onValueChange={(status) => set("status", status as FormValues["status"])}>
            <SelectTrigger id="resource-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="published">Published: members can find it</SelectItem>
              <SelectItem value="suggested">Suggested: waiting for review</SelectItem>
              <SelectItem value="unpublished">Unpublished: hidden</SelectItem>
            </SelectContent>
          </Select>
          {data?.suggestedByName ? <p className="mt-2 text-xs text-muted-foreground">Suggested by {data.suggestedByName}</p> : null}
          <Button type="submit" className="mt-4 w-full" size="lg" disabled={pending}>
            {pending ? <Spinner /> : <Save />}
            {data ? "Save changes" : "Create resource"}
          </Button>
          {dirty ? <p className="mt-2 text-center text-xs text-muted-foreground">You have unsaved changes</p> : null}
        </div>

        {reports.length ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <h2 className="flex items-center gap-2 font-sans text-sm font-semibold">
              <Flag className="size-4 text-destructive" aria-hidden />
              {reports.length} open {reports.length === 1 ? "report" : "reports"}
            </h2>
            <ul className="mt-3 grid gap-2">
              {reports.map((report) => (
                <li key={report.id} className="rounded-lg bg-card p-2.5 text-sm">
                  <p className="font-medium">{REASON_LABELS[report.reason]}</p>
                  {report.note ? <p className="mt-0.5 text-muted-foreground">“{report.note}”</p> : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {report.reporterName} · {new Date(report.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-3 grid gap-2">
              <Button type="button" variant="outline" size="sm" onClick={dismiss} disabled={pending}>
                <ShieldCheck /> Keep it, dismiss reports
              </Button>
              <p className="text-xs text-muted-foreground">To hide it, set the status to Unpublished and save: that closes the reports too.</p>
            </div>
          </div>
        ) : null}

        {data ? (
          <div className="rounded-xl border bg-card p-4 text-sm">
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Star className="size-3" aria-hidden /> Rating
                </dt>
                <dd className="mt-0.5 font-semibold tabular-nums">
                  {data.stats.ratingCount ? `${data.stats.ratingAverage.toFixed(1)} (${data.stats.ratingCount})` : "—"}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Heart className="size-3" aria-hidden /> Saved by
                </dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{data.stats.favoriteCount}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" asChild>
                <Link href={`/resources/${data.id}`} target="_blank">
                  <ExternalLink /> View as member
                </Link>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive" size="sm">
                    <Trash2 /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this resource?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This also removes members&apos; saves, ratings and reports for it. To hide it but keep its history, unpublish it instead.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={remove}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ) : null}
      </aside>
    </form>
  );
}

function GeoStatus({
  geocode,
  geocoding,
  onRetry,
  pending,
  resource,
}: {
  geocode: ResourceEditData["geocode"];
  geocoding: boolean;
  onRetry: () => void;
  pending: boolean;
  resource: FormValues;
}) {
  const ok = geocode.status === "ok" && geocode.lat != null;
  return (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5 text-sm", ok ? "bg-success/10" : "bg-warning/15")}>
      {ok ? <MapPin className="size-4 text-success" aria-hidden /> : <MapPinOff className="size-4" aria-hidden />}
      <span className="flex-1">
        {ok
          ? `On the map at ${geocode.lat?.toFixed(4)}, ${geocode.lng?.toFixed(4)}${geocode.source === "manual" ? " (pinned by hand)" : ""}.`
          : geocode.status === "failed"
            ? "We couldn't find this address on the map."
            : geocode.status === "pending"
              ? "Waiting to be placed on the map."
              : "Not on the map: add an address or a map pin."}
      </span>
      {ok ? (
        <a href={mapsHref(resource)} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
          Check in Maps
        </a>
      ) : geocoding ? (
        <Button type="button" size="sm" variant="outline" onClick={onRetry} disabled={pending}>
          <RefreshCw /> Try again
        </Button>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-destructive" aria-hidden>*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
