"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Ban, Eye, KeyRound, Lock, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ROLE_LABELS, ROLES, type Role } from "@/server/auth/roles";
import { impersonateAction, sendAccountLinkAction, setRolesAction, updateAccountAction } from "../actions";
import { TIMEZONES, updateAccountSchema } from "../schemas";
import type { UserDetail } from "../types";
import { ConfirmAction, RoleBadge } from "./bits";
import { DeactivateButton, ReactivateButton } from "./bulk-dialogs";
import { runAction } from "./run-action";

const ROLE_HELP: Record<Role, string> = {
  admin: "Everything, including impersonation and settings.",
  research_admin: "Study management, content, reports and surveys.",
  coordinator: "Study management, content, reports, Peer Navigation.",
  coach: "Peer navigator: coaches assigned participants.",
  participant: "Intervention arm: the full Link Positively app.",
  control: "Control arm: can sign in to the basic app.",
  ecoach_user: "Enrolled in Peer Navigation.",
};

export function UserActions({
  user,
  canEdit,
  canImpersonate,
  isSelf,
}: {
  user: Pick<UserDetail, "id" | "name" | "banned" | "roles" | "passwordSet" | "email">;
  canEdit: boolean;
  canImpersonate: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const people = [{ id: user.id, name: user.name }];
  const impersonable = canImpersonate && !isSelf && !user.banned && !user.roles.includes("admin");

  async function sendLink(kind: "welcome" | "reset") {
    setPending(kind);
    await runAction(
      sendAccountLinkAction({ userId: user.id, kind }),
      kind === "welcome" ? `Welcome link sent to ${user.email}` : `Password reset link sent to ${user.email}`,
    );
    setPending(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {impersonable ? (
        <ConfirmAction
          trigger={
            <Button variant="outline" size="lg">
              <Eye /> View as {user.name.split(" ")[0]}
            </Button>
          }
          title={`View the app as ${user.name}?`}
          description={
            <>
              <p>You&apos;ll see exactly what they see, for up to an hour. Anything you do is done as them, so look — don&apos;t post.</p>
              <p>This is recorded in the audit log. Use “Stop viewing” in the banner to come back.</p>
            </>
          }
          confirmLabel="Start viewing"
          onConfirm={async () => {
            const data = await runAction(impersonateAction({ userId: user.id }));
            if (!data) return false;
            window.location.assign(data.destination);
          }}
        />
      ) : null}
      {canEdit && !isSelf && !user.banned ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="lg" disabled={Boolean(pending)}>
              {pending ? <Spinner /> : <Mail />} Email a link
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>{user.passwordSet ? "They have a password" : "They haven't set a password yet"}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => sendLink("welcome")}>
              <Mail /> Welcome link (set password)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => sendLink("reset")}>
              <KeyRound /> Password reset link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="font-normal text-muted-foreground">Links expire and work once.</DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {canEdit && !isSelf ? (
        user.banned ? (
          <ReactivateButton
            people={people}
            onDone={() => router.refresh()}
            trigger={
              <Button variant="outline" size="lg">
                <ShieldCheck /> Reactivate
              </Button>
            }
          />
        ) : (
          <DeactivateButton
            people={people}
            onDone={() => router.refresh()}
            trigger={
              <Button variant="destructive" size="lg">
                <Ban /> Deactivate
              </Button>
            }
          />
        )
      ) : null}
    </div>
  );
}

type FormState = {
  name: string;
  email: string;
  studyId: string;
  phone: string;
  timezone: string;
  pronouns: string;
  age: string;
  smsOptOut: boolean;
};

export function AccountForm({ user, canEdit }: { user: UserDetail; canEdit: boolean }) {
  const router = useRouter();
  const initial: FormState = {
    name: user.name,
    email: user.email,
    studyId: user.studyId ?? "",
    phone: user.phone ?? "",
    timezone: user.timezone,
    pronouns: user.pronouns ?? "",
    age: user.age ? String(user.age) : "",
    smsOptOut: user.smsOptOut,
  };
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [pending, setPending] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const input = { userId: user.id, ...form, age: form.age ? Number(form.age) : null };
    const parsed = updateAccountSchema.safeParse(input);
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof FormState] ??= issue.message;
      setErrors(next);
      return;
    }
    setPending(true);
    const data = await runAction(updateAccountAction(parsed.data), "Saved");
    setPending(false);
    if (data) router.refresh();
  }

  const field = (key: keyof FormState, label: string, props: React.ComponentProps<typeof Input> = {}, help?: string) => (
    <Field data-invalid={Boolean(errors[key])}>
      <FieldLabel htmlFor={`account-${key}`}>{label}</FieldLabel>
      <Input
        id={`account-${key}`}
        value={form[key] as string}
        onChange={(event) => set(key, event.target.value as never)}
        disabled={!canEdit}
        aria-invalid={Boolean(errors[key])}
        className="h-9"
        {...props}
      />
      {errors[key] ? <FieldError>{errors[key]}</FieldError> : help ? <FieldDescription>{help}</FieldDescription> : null}
    </Field>
  );

  return (
    <form onSubmit={save} noValidate>
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        {field("name", "Display name")}
        {field("email", "Email", { type: "email", autoComplete: "off" })}
        {field("studyId", "Study ID", { className: "h-9 tabular-nums" })}
        {field("phone", "Mobile number", { type: "tel", placeholder: "+19879543210" }, "Used for the weekly study texts.")}
        <Field>
          <FieldLabel htmlFor="account-timezone">Timezone</FieldLabel>
          <Select value={form.timezone} onValueChange={(value) => set("timezone", value)} disabled={!canEdit}>
            <SelectTrigger id="account-timezone" className="w-full data-[size=default]:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((zone) => (
                <SelectItem key={zone.value} value={zone.value}>
                  {zone.label}
                </SelectItem>
              ))}
              {!TIMEZONES.some((zone) => zone.value === user.timezone) ? <SelectItem value={user.timezone}>{user.timezone}</SelectItem> : null}
            </SelectContent>
          </Select>
          <FieldDescription>Study days and text times follow this. Texts already planned keep their time.</FieldDescription>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          {field("pronouns", "Pronouns", { placeholder: "Eg. he/him, she/her" })}
          {field("age", "Age", { inputMode: "numeric" })}
        </div>
        <Field orientation="horizontal" className="rounded-xl border bg-muted/30 p-3 sm:col-span-2">
          <Switch id="account-optout" checked={!form.smsOptOut} onCheckedChange={(value) => set("smsOptOut", !value)} disabled={!canEdit} />
          <div className="grid gap-0.5">
            <FieldLabel htmlFor="account-optout">Study texts</FieldLabel>
            <FieldDescription>
              {form.smsOptOut ? "Off — this person opted out. Weekly texts are skipped." : "On — weekly program texts are sent to this number."}
            </FieldDescription>
          </div>
        </Field>
      </FieldGroup>
      {canEdit ? (
        <div className="mt-5 flex items-center justify-end gap-2">
          {dirty ? (
            <Button type="button" variant="ghost" onClick={() => setForm(initial)} disabled={pending}>
              Discard changes
            </Button>
          ) : null}
          <Button type="submit" disabled={!dirty || pending}>
            {pending ? <Spinner /> : null}
            Save changes
          </Button>
        </div>
      ) : null}
    </form>
  );
}

export function RolesEditor({
  userId,
  roles,
  delegable,
  isSelf,
  canAssign,
}: {
  userId: string;
  roles: Role[];
  delegable: Role[];
  isSelf: boolean;
  canAssign: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<Role>>(new Set(roles));
  const allowed = useMemo(() => new Set(delegable), [delegable]);
  const editable = canAssign && !isSelf;
  const dirty = [...selected].sort().join() !== [...roles].sort().join();
  const joining = selected.has("participant") && !roles.includes("participant");
  const leaving = !selected.has("participant") && roles.includes("participant");

  function toggle(role: Role, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(role);
      else next.delete(role);
      if (role === "participant" && on) next.delete("control");
      if (role === "control" && on) next.delete("participant");
      return next;
    });
  }

  async function save() {
    const data = await runAction(setRolesAction({ userId, roles: [...selected] }), "Roles updated");
    if (!data) return false;
    router.refresh();
  }

  return (
    <div className="space-y-1">
      {ROLES.map((role) => {
        const locked = !editable || !allowed.has(role);
        return (
          <label
            key={role}
            htmlFor={`role-${role}`}
            className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 hover:bg-muted/50 has-[:disabled]:cursor-default has-[:disabled]:hover:bg-transparent"
          >
            <Checkbox
              id={`role-${role}`}
              className="mt-0.5"
              checked={selected.has(role)}
              disabled={locked}
              onCheckedChange={(value) => toggle(role, Boolean(value))}
            />
            <span className="grid flex-1 gap-0.5">
              <span className="flex items-center gap-2 text-sm font-medium">
                {ROLE_LABELS[role]}
                {locked && editable ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Lock className="size-3 text-muted-foreground" aria-label="You can't assign this role" />
                    </TooltipTrigger>
                    <TooltipContent>Only an administrator can assign this role.</TooltipContent>
                  </Tooltip>
                ) : null}
              </span>
              <span className="text-xs text-muted-foreground">{ROLE_HELP[role]}</span>
            </span>
          </label>
        );
      })}
      {isSelf ? <p className="px-2 pt-2 text-xs text-muted-foreground">You can&apos;t change your own roles.</p> : null}
      {editable && dirty ? (
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set(roles))}>
            Undo
          </Button>
          <ConfirmAction
            trigger={<Button size="sm">Save roles</Button>}
            title="Change roles?"
            description={
              <>
                <p className="flex flex-wrap items-center gap-1">
                  New roles:{" "}
                  {[...selected].length ? [...selected].map((role) => <RoleBadge key={role} role={role} />) : <RoleBadge role="control" />}
                </p>
                {joining ? (
                  <p>
                    <strong className="text-foreground">This starts the intervention today:</strong> the study start date is set to today,
                    the welcome text goes out in 15 minutes and weekly texts follow.
                  </p>
                ) : null}
                {leaving ? <p>Upcoming study texts will be cancelled.</p> : null}
              </>
            }
            confirmLabel="Save roles"
            onConfirm={save}
          />
        </div>
      ) : null}
    </div>
  );
}
