import type { Role } from "@/server/auth/roles";

/** DTOs for the staff admin screens (plain, serialisable). */

export type UserRow = {
  id: string;
  name: string;
  username: string;
  email: string;
  roles: Role[];
  roleLabel: string;
  banned: boolean;
  programs: string[];
  createdAt: string;
  studyId: string | null;
  coachId: string | null;
  coachName: string | null;
  interventionStartDate: string | null;
  studyWeek: number | null;
  lastLoginAt: string | null;
  smsOptOut: boolean;
  hasPhone: boolean;
};

export type SmsHistoryRow = {
  id: string;
  flag: string;
  week: number;
  cycle: string;
  scheduledFor: string;
  status: "scheduled" | "sending" | "sent" | "failed" | "skipped" | "cancelled";
  reason: string | null;
  sentAt: string | null;
  clickedAt: string | null;
  clicks: number;
  body: string | null;
  linkPath: string | null;
};

export type AuditRow = {
  id: string;
  at: string;
  action: string;
  summary: string;
  actorId: string | null;
  actorName: string;
  impersonatedBy: string | null;
  targetIds: string[];
  targetNames: string[];
};

export type UserDetail = UserRow & {
  banReason: string | null;
  timezone: string;
  phone: string | null;
  pronouns: string | null;
  age: number | null;
  roleChangedAt: string | null;
  passwordSet: boolean;
  logins: { id: string; loginAt: string; logoutAt: string | null; device: string; program: string }[];
  sms: SmsHistoryRow[];
  audit: AuditRow[];
};

export type DashboardData = {
  enrolled: number;
  control: number;
  participants: number;
  peerNav: number;
  blocked: number;
  staff: number;
  completed: number;
  weeks: { week: number; count: number }[];
  activeUsers: number;
  loginsThisWeek: number;
  checkinsThisWeek: number | null;
  smsSent: number;
  smsFailed: number;
  smsClicks: number;
  smsScheduledToday: number;
  recentAudit: AuditRow[];
  recentLogins: { userId: string; name: string; at: string }[];
};
