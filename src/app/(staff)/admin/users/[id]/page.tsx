import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BellOff, CalendarDays, CircleAlert, HeartHandshake, IdCard, MessageSquareText, Phone } from "lucide-react";
import { UserAvatar } from "@/components/app/user-avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { delegableRoles } from "@/features/admin/accounts";
import { DateText, RoleBadges, StatusDot, TimeAgo } from "@/features/admin/components/bits";
import { AccountForm, RolesEditor, UserActions } from "@/features/admin/components/user-detail";
import { AuditList, LoginHistory, SmsHistory } from "@/features/admin/components/user-sections";
import { UserSurveys } from "@/features/admin/components/user-surveys";
import { getUserDetail } from "@/features/admin/queries";
import { formatPhone } from "@/features/sms/phone";
import { getUserSurveys } from "@/features/surveys/queries";
import { formatInZone } from "@/lib/dates";
import { can, requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Person" };

function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground [&_svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-sm font-medium">{children}</dd>
      </div>
    </div>
  );
}

export default async function UserPage({ params }: PageProps<"/admin/users/[id]">) {
  const viewer = await requirePermission("users.view");
  const { id } = await params;
  const user = await getUserDetail(id);
  if (!user) notFound();
  const surveys = await getUserSurveys(id);
  const isSelf = viewer.id === user.id;
  const inIntervention = user.roles.includes("participant");
  const smsCounts = {
    sent: user.sms.filter((row) => row.status === "sent").length,
    clicked: user.sms.filter((row) => row.clickedAt).length,
    problems: user.sms.filter((row) => row.status === "failed").length,
  };

  return (
    <div className="animate-rise">
      <Link href="/admin/users" className="mb-4 inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> People
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <UserAvatar userId={user.id} name={user.name} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-[1.65rem] leading-tight font-semibold sm:text-3xl">{user.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
              <span>@{user.username}</span>
              <RoleBadges roles={user.roles} />
              {user.banned ? <StatusDot tone="destructive">Deactivated</StatusDot> : <StatusDot tone="success">Active</StatusDot>}
            </div>
          </div>
        </div>
        <UserActions user={user} canEdit={can(viewer, "users.edit")} canImpersonate={can(viewer, "users.impersonate")} isSelf={isSelf} />
      </div>

      {user.banned ? (
        <div role="status" className="mb-6 flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 p-4 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <div>
            <p className="font-medium">This account is deactivated</p>
            <p className="text-muted-foreground">{user.banReason ?? "Deactivated by staff."} They can&apos;t sign in and won&apos;t get study texts.</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-2xl border bg-card p-5 shadow-soft" aria-labelledby="study-heading">
            <h2 id="study-heading" className="mb-4 text-base font-semibold">
              Study
            </h2>
            <dl className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
              <Fact icon={<IdCard />} label="Study ID">
                {user.studyId ? <span className="tabular-nums">{user.studyId}</span> : <span className="text-muted-foreground">Not set</span>}
              </Fact>
              <Fact icon={<CalendarDays />} label={inIntervention ? "Intervention" : "Arm"}>
                {inIntervention && user.interventionStartDate ? (
                  <>
                    {user.studyWeek && user.studyWeek > 24 ? "Finished" : `Week ${user.studyWeek} of 24`}
                    <span className="block text-xs font-normal text-muted-foreground">
                      Started {formatInZone(user.interventionStartDate, "MMM d, yyyy", user.timezone)}
                    </span>
                  </>
                ) : user.roles.includes("control") ? (
                  "Control"
                ) : (
                  <span className="text-muted-foreground">Not in the study arms</span>
                )}
              </Fact>
              <Fact icon={user.smsOptOut ? <BellOff /> : <Phone />} label="Mobile">
                {user.phone ? formatPhone(user.phone) : <span className="text-muted-foreground">No number</span>}
                {user.smsOptOut ? <span className="block text-xs font-normal text-destructive">Opted out of texts</span> : null}
              </Fact>
              <Fact icon={<HeartHandshake />} label="Peer navigator">
                {user.coachName ?? <span className="text-muted-foreground">None</span>}
              </Fact>
            </dl>
          </section>

          <Tabs defaultValue="texts" className="gap-3">
            <TabsList>
              <TabsTrigger value="texts">
                <MessageSquareText /> Study texts
              </TabsTrigger>
              <TabsTrigger value="account">Account</TabsTrigger>
              <TabsTrigger value="signins">Sign-ins</TabsTrigger>
              <TabsTrigger value="activity">Staff activity</TabsTrigger>
            </TabsList>
            <TabsContent value="texts" className="overflow-hidden rounded-2xl border bg-card shadow-soft">
              {user.sms.length ? (
                <div className="flex flex-wrap gap-x-6 gap-y-1 border-b bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
                  <span>
                    <strong className="font-semibold text-foreground tabular-nums">{smsCounts.sent}</strong> sent
                  </span>
                  <span>
                    <strong className="font-semibold text-foreground tabular-nums">{smsCounts.clicked}</strong> opened
                  </span>
                  {smsCounts.problems ? (
                    <span className="text-destructive">
                      <strong className="font-semibold tabular-nums">{smsCounts.problems}</strong> failed
                    </span>
                  ) : null}
                  <span className="ml-auto text-xs">Times shown in their timezone ({user.timezone.split("/")[1]?.replace("_", " ")})</span>
                </div>
              ) : null}
              <SmsHistory user={user} viewerTimezone={viewer.timezone} canManage={can(viewer, "sms.manage")} />
            </TabsContent>
            <TabsContent value="account" className="rounded-2xl border bg-card p-5 shadow-soft">
              <AccountForm user={user} canEdit={can(viewer, "users.edit")} />
            </TabsContent>
            <TabsContent value="signins" className="overflow-hidden rounded-2xl border bg-card shadow-soft">
              <LoginHistory user={user} timezone={viewer.timezone} />
            </TabsContent>
            <TabsContent value="activity" className="overflow-hidden rounded-2xl border bg-card shadow-soft">
              <AuditList rows={user.audit} timezone={viewer.timezone} />
            </TabsContent>
          </Tabs>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border bg-card p-3 shadow-soft" aria-labelledby="roles-heading">
            <h2 id="roles-heading" className="px-2 pt-1 pb-2 text-base font-semibold">
              Roles
            </h2>
            <RolesEditor
              userId={user.id}
              roles={user.roles}
              delegable={[...delegableRoles(viewer.roles)]}
              isSelf={isSelf}
              canAssign={can(viewer, "users.assignRoles")}
            />
          </section>
          <section className="rounded-2xl border bg-card p-3 shadow-soft" aria-labelledby="surveys-heading">
            <h2 id="surveys-heading" className="px-2 pt-1 pb-2 text-base font-semibold">
              Surveys
            </h2>
            <UserSurveys userId={user.id} surveys={surveys} timezone={viewer.timezone} canEdit={can(viewer, "users.edit")} />
          </section>
          <section className="rounded-2xl border bg-card p-5 text-sm shadow-soft">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt className="text-muted-foreground">Joined</dt>
              <dd className="text-right">
                <DateText date={user.createdAt} timezone={viewer.timezone} pattern="MMM d, yyyy" />
              </dd>
              <dt className="text-muted-foreground">Last sign-in</dt>
              <dd className="text-right">
                <TimeAgo date={user.lastLoginAt} timezone={viewer.timezone} fallback="Never" />
              </dd>
              <dt className="text-muted-foreground">Password</dt>
              <dd className="text-right">{user.passwordSet ? "Set" : <span className="text-warning-foreground dark:text-warning">Not set yet</span>}</dd>
              <dt className="text-muted-foreground">Programs</dt>
              <dd className="text-right">{user.programs.map((p) => (p === "peernav" ? "Peer Navigation" : "Link Positively")).join(", ")}</dd>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
