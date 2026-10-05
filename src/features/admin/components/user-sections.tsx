import { LogIn, MessageSquareText, MousePointerClick } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { formatInZone } from "@/lib/dates";
import { SendRowActions } from "@/features/sms/components/send-row-actions";
import { flagLabel, SendStatusBadge } from "@/features/sms/components/send-status";
import { reasonLabel } from "@/features/sms/types";
import type { AuditRow, UserDetail } from "../types";
import { DateText, TimeAgo } from "./bits";

function nextUp(rows: UserDetail["sms"]) {
  const now = Date.now();
  return rows.find((row) => row.status === "scheduled" && new Date(row.scheduledFor).getTime() > now);
}

export function SmsHistory({ user, viewerTimezone, canManage }: { user: UserDetail; viewerTimezone: string; canManage: boolean }) {
  if (!user.sms.length) {
    return (
      <Empty className="py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageSquareText />
          </EmptyMedia>
          <EmptyTitle>No study texts</EmptyTitle>
          <EmptyDescription>Texts are planned when someone is converted to participant.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const rows = [...user.sms].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  const next = nextUp(rows);
  return (
    <ol className="divide-y">
      {rows.map((row) => (
        <li key={row.id} className={row.id === next?.id ? "bg-brand-sky/5" : undefined}>
          <details className="group px-4 py-2.5 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex min-h-7 cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              <span className="w-20 shrink-0 text-sm font-medium">{flagLabel(row.flag)}</span>
              <span className="w-44 shrink-0 text-sm text-muted-foreground tabular-nums" title={`${user.timezone} (participant's time)`}>
                {formatInZone(row.scheduledFor, "EEE MMM d, h:mm a", user.timezone)}
              </span>
              <SendStatusBadge status={row.status} />
              {row.id === next?.id ? <span className="text-xs font-medium text-brand-sky">Next up</span> : null}
              {row.clickedAt ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <MousePointerClick className="size-3.5 text-primary" aria-hidden /> Opened
                  {row.clicks > 1 ? ` ×${row.clicks}` : ""}
                </span>
              ) : null}
              {row.reason ? <span className="text-xs text-muted-foreground">{reasonLabel(row.reason)}</span> : null}
              {canManage ? (
                <span
                  className={
                    row.status === "scheduled"
                      ? "ml-auto opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                      : "ml-auto"
                  }
                >
                  <SendRowActions id={row.id} flag={row.flag} status={row.status} name={user.name} />
                </span>
              ) : null}
            </summary>
            <div className="mt-2 ml-0 rounded-xl bg-muted/50 p-3 text-sm sm:ml-24">
              {row.body ? <p className="whitespace-pre-wrap">{row.body}</p> : <p className="text-muted-foreground">The text is filled in when it&apos;s sent.</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                {row.sentAt ? (
                  <>
                    Sent <DateText date={row.sentAt} timezone={viewerTimezone} pattern="PPp" />
                  </>
                ) : (
                  <>Planned for {formatInZone(row.scheduledFor, "PPPP 'at' h:mm a", user.timezone)} their time</>
                )}
                {row.clickedAt ? (
                  <>
                    {" "}
                    · first opened <DateText date={row.clickedAt} timezone={viewerTimezone} pattern="PPp" />
                  </>
                ) : null}
                {row.linkPath ? ` · links to ${row.linkPath}` : null}
              </p>
            </div>
          </details>
        </li>
      ))}
    </ol>
  );
}

export function LoginHistory({ user, timezone }: { user: UserDetail; timezone: string }) {
  if (!user.logins.length) {
    return (
      <Empty className="py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LogIn />
          </EmptyMedia>
          <EmptyTitle>No sign-ins yet</EmptyTitle>
          <EmptyDescription>
            {user.passwordSet ? "They haven't signed in since their account was made." : "They haven't set a password yet — send them a welcome link."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ul className="divide-y">
      {user.logins.map((login) => {
        const minutes = login.logoutAt ? Math.max(1, Math.round((Date.parse(login.logoutAt) - Date.parse(login.loginAt)) / 60000)) : null;
        return (
          <li key={login.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
            <span className="w-48 shrink-0 tabular-nums">
              <DateText date={login.loginAt} timezone={timezone} pattern="EEE MMM d, h:mm a" />
            </span>
            <span className="text-muted-foreground">{login.device}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {minutes ? `Signed out after ${minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`}` : "No sign-out recorded"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function AuditList({ rows, timezone, showTargets = false }: { rows: AuditRow[]; timezone: string; showTargets?: boolean }) {
  if (!rows.length) return <p className="px-4 py-8 text-center text-sm text-muted-foreground">No staff actions recorded yet.</p>;
  return (
    <ul className="divide-y">
      {rows.map((row) => (
        <li key={row.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block">{row.summary}</span>
            <span className="block text-xs text-muted-foreground">
              {row.actorName}
              {row.impersonatedBy ? ` (while ${row.impersonatedBy} was viewing as them)` : ""}
              {showTargets && row.targetNames.length ? ` · ${row.targetNames.join(", ")}${row.targetIds.length > 3 ? ` +${row.targetIds.length - 3}` : ""}` : ""}
            </span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            <TimeAgo date={row.at} timezone={timezone} />
          </span>
        </li>
      ))}
    </ul>
  );
}
