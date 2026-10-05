import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Clock3,
  Ban,
  ClipboardCheck,
  FlaskConical,
  MessageSquareText,
  MousePointerClick,
  Shuffle,
  Sparkles,
  TriangleAlert,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { UserAvatar } from "@/components/app/user-avatar";
import { StatCard, TimeAgo } from "@/features/admin/components/bits";
import { AuditList } from "@/features/admin/components/user-sections";
import { WeekChart } from "@/features/admin/components/week-chart";
import { getDashboard } from "@/features/admin/queries";
import { can, requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Dashboard" };

function Panel({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-2xl border bg-card shadow-soft ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-2 border-b px-5 py-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default async function AdminDashboardPage() {
  const viewer = await requirePermission("users.view");
  const data = await getDashboard();
  const inProgram = data.weeks.reduce((sum, row) => sum + row.count, 0);
  const firstName = viewer.name.split(" ")[0];

  const links = [
    can(viewer, "users.create") && { href: "/admin/users/new", label: "Create a participant", icon: UserPlus },
    can(viewer, "users.randomize") && { href: "/admin/randomization", label: `Randomize control accounts (${data.control})`, icon: Shuffle },
    can(viewer, "sms.manage") && { href: "/admin/content/sms/log", label: "SMS send log", icon: MessageSquareText },
    can(viewer, "surveys.manage") && { href: "/admin/surveys", label: "Surveys", icon: ClipboardCheck },
    can(viewer, "reports.view") && { href: "/admin/reports", label: "Reports & exports", icon: Activity },
  ].filter(Boolean) as { href: string; label: string; icon: typeof UserPlus }[];

  return (
    <div className="animate-rise">
      <PageHeader title={`Hello, ${firstName}`} description="The study at a glance. Numbers cover the last 7 days unless noted." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Enrolled" value={data.enrolled} hint={`${data.participants} participants · ${data.control} control`} icon={<UsersRound />} href="/admin/users" />
        <StatCard label="In the program now" value={inProgram} hint={`${data.completed} finished all 24 weeks`} icon={<Sparkles />} href="/admin/users?view=participants" />
        <StatCard label="Active this week" value={data.activeUsers} hint={`${data.loginsThisWeek} sign-ins`} icon={<Activity />} />
        <StatCard
          label="Check-ins this week"
          value={data.checkinsThisWeek ?? "—"}
          hint={data.checkinsThisWeek === null ? "Check-ins aren't recorded yet" : "Daily and weekly, since Monday"}
          icon={<ClipboardCheck />}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Panel
            title="Where participants are"
            action={<span className="text-sm text-muted-foreground tabular-nums">{inProgram} in weeks 1–24</span>}
          >
            <div className="px-3 pt-4 pb-2">
              {inProgram ? (
                <WeekChart weeks={data.weeks} />
              ) : (
                <p className="px-2 py-16 text-center text-sm text-muted-foreground">Nobody is in the 24-week program right now.</p>
              )}
            </div>
            <table className="sr-only">
              <caption>Participants per study week</caption>
              <tbody>
                {data.weeks.map((row) => (
                  <tr key={row.week}>
                    <th scope="row">Week {row.week}</th>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel
            title="Study texts this week"
            action={
              can(viewer, "sms.manage") ? (
                <Link href="/admin/content/sms/log" className="text-sm text-primary hover:underline">
                  Send log
                </Link>
              ) : null
            }
          >
            <dl className="grid grid-cols-2 divide-y sm:grid-cols-4 sm:divide-x sm:divide-y-0">
              {[
                { label: "Sent", value: data.smsSent, icon: MessageSquareText },
                { label: "Opened", value: data.smsClicks, icon: MousePointerClick },
                { label: "Failed", value: data.smsFailed, icon: TriangleAlert, warn: data.smsFailed > 0 },
                { label: "Due in 24h", value: data.smsScheduledToday, icon: Clock3 },
              ].map((item) => (
                <div key={item.label} className="px-5 py-4">
                  <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <item.icon className={`size-3.5 ${item.warn ? "text-destructive" : ""}`} aria-hidden /> {item.label}
                  </dt>
                  <dd className={`mt-1 font-heading text-2xl font-semibold tabular-nums ${item.warn ? "text-destructive" : ""}`}>{item.value}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel title="Recent staff activity" action={can(viewer, "users.edit") ? <Link href="/admin/audit" className="text-sm text-primary hover:underline">Audit log</Link> : null}>
            <AuditList rows={data.recentAudit} timezone={viewer.timezone} />
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Quick links">
            <ul className="p-2">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                      <link.icon className="size-4" aria-hidden />
                    </span>
                    <span className="flex-1 font-medium">{link.label}</span>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Accounts">
            <dl className="divide-y text-sm">
              {[
                { label: "Control", value: data.control, icon: FlaskConical },
                { label: "Participants", value: data.participants, icon: Sparkles },
                { label: "Peer Navigation", value: data.peerNav, icon: UsersRound },
                { label: "Staff", value: data.staff, icon: UsersRound },
                { label: "Deactivated", value: data.blocked, icon: Ban, href: "/admin/users?view=deactivated" },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3 px-5 py-2.5">
                  <row.icon className="size-4 text-muted-foreground" aria-hidden />
                  <dt className="flex-1">{row.href ? <Link href={row.href} className="hover:underline">{row.label}</Link> : row.label}</dt>
                  <dd className="font-semibold tabular-nums">{row.value}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel title="Latest sign-ins">
            <ul className="divide-y">
              {data.recentLogins.length ? (
                data.recentLogins.map((login, index) => (
                  <li key={`${login.userId}-${index}`} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <UserAvatar userId={login.userId} name={login.name} size="xs" />
                    <Link href={`/admin/users/${login.userId}`} className="min-w-0 flex-1 truncate hover:underline">
                      {login.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      <TimeAgo date={login.at} timezone={viewer.timezone} />
                    </span>
                  </li>
                ))
              ) : (
                <li className="px-5 py-6 text-center text-sm text-muted-foreground">No sign-ins yet.</li>
              )}
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
