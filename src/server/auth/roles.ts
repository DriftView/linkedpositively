/**
 * Roles and permissions for both programs.
 *
 * The Drupal sites had ~160 fine-grained permissions spread over two sites
 * and "level-N" roles used as feature flags. Here a user holds a small set of
 * roles, permissions are coarse and feature-shaped, and levels are computed
 * from points (see features/gamification) instead of being roles.
 *
 * Legacy role mapping (both sites) lives in LEGACY_ROLE_MAP for the migration.
 */

export const ROLES = [
  "admin",
  "research_admin",
  "coordinator",
  "coach",
  "participant",
  "control",
  "ecoach_user",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  research_admin: "Research administrator",
  coordinator: "Coordinator",
  coach: "Peer navigator",
  participant: "Participant",
  control: "Control",
  ecoach_user: "Peer Navigation participant",
};

export const STAFF_ROLES: Role[] = ["admin", "research_admin", "coordinator", "coach"];

export const PERMISSIONS = [
  // Link Positively participant features
  "lp.access",
  "community.post",
  "community.react",
  "community.report",
  "tips.view",
  "tips.earnPoints",
  "tracker.use",
  "checkin.weekly",
  "resources.view",
  "resources.suggest",
  "gamification.earn",
  "peernav.open",
  // Peer Navigation
  "peernav.participant",
  "peernav.coach",
  "peernav.allParticipants",
  "peernav.assignCoach",
  "peernav.editParticipant",
  "peernav.messages",
  "peernav.sessionReport",
  // Staff
  "admin.access",
  "users.view",
  "users.create",
  "users.edit",
  "users.assignRoles",
  "users.randomize",
  "users.impersonate",
  "content.manage",
  "resources.manage",
  "moderation.review",
  "reports.view",
  "sms.manage",
  "surveys.manage",
  "support.manage",
  "settings.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const PARTICIPANT: Permission[] = [
  "lp.access",
  "community.post",
  "community.react",
  "community.report",
  "tips.view",
  "tips.earnPoints",
  "tracker.use",
  "checkin.weekly",
  "resources.view",
  "resources.suggest",
  "gamification.earn",
];

const STAFF_BASE: Permission[] = ["admin.access", "users.view", "lp.access", "tips.view", "resources.view"];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [...PERMISSIONS],
  research_admin: [
    ...STAFF_BASE,
    "community.post",
    "community.react",
    "users.edit",
    "users.assignRoles",
    "users.randomize",
    "content.manage",
    "resources.manage",
    "moderation.review",
    "reports.view",
    "sms.manage",
    "surveys.manage",
    "support.manage",
  ],
  coordinator: [
    ...STAFF_BASE,
    "community.post",
    "community.react",
    "users.create",
    "users.edit",
    "users.assignRoles",
    "users.randomize",
    "content.manage",
    "resources.manage",
    "moderation.review",
    "reports.view",
    "sms.manage",
    "support.manage",
    "peernav.coach",
    "peernav.allParticipants",
    "peernav.assignCoach",
    "peernav.editParticipant",
    "peernav.sessionReport",
  ],
  coach: [
    "admin.access",
    "peernav.coach",
    "peernav.editParticipant",
    "peernav.messages",
    "peernav.sessionReport",
    "resources.suggest",
  ],
  participant: PARTICIPANT,
  // Control-arm accounts exist before randomization. They can sign in but the
  // intervention features stay closed until they are converted to participant
  // (Drupal: control users saw the basic app, info pages and their profile).
  control: ["lp.access"],
  ecoach_user: ["peernav.participant", "peernav.messages", "peernav.open"],
};

/** Roles a user with `users.assignRoles` may hand out (Drupal role_delegation). */
export const DELEGABLE_ROLES: Record<Role, Role[]> = {
  admin: [...ROLES],
  research_admin: ["coach", "control", "coordinator", "ecoach_user", "participant", "research_admin"],
  coordinator: ["coach", "control", "coordinator", "ecoach_user", "participant", "research_admin"],
  coach: [],
  participant: [],
  control: [],
  ecoach_user: [],
};

export function parseRoles(value: string | null | undefined): Role[] {
  if (!value) return [];
  return value
    .split(",")
    .map((role) => role.trim())
    .filter((role): role is Role => (ROLES as readonly string[]).includes(role));
}

export function serializeRoles(roles: Role[]) {
  return [...new Set(roles)].join(",");
}

export function permissionsFor(roles: Role[]) {
  const set = new Set<Permission>();
  for (const role of roles) for (const permission of ROLE_PERMISSIONS[role]) set.add(permission);
  return set;
}

export function hasPermission(roles: Role[], permission: Permission) {
  return roles.some((role) => ROLE_PERMISSIONS[role].includes(permission));
}

export function isStaff(roles: Role[]) {
  return roles.some((role) => STAFF_ROLES.includes(role));
}

/** The most descriptive role, for display. */
export function primaryRoleLabel(roles: Role[]) {
  const order: Role[] = ["admin", "research_admin", "coordinator", "coach", "participant", "ecoach_user", "control"];
  const role = order.find((candidate) => roles.includes(candidate));
  return role ? ROLE_LABELS[role] : "Member";
}

/** Drupal role names (both sites) → new roles. level-* roles become computed levels. */
export const LEGACY_ROLE_MAP: Record<string, Role | null> = {
  administrator: "admin",
  "Research Administrator User": "research_admin",
  "Coordinator User": "coordinator",
  coordinator: "coordinator",
  coach: "coach",
  participant: "participant",
  control: "control",
  "ecoach-user": "ecoach_user",
  "tech-participant": "ecoach_user",
};

/**
 * Where a user lands after signing in (when no `?next=` page was asked for):
 * staff → the admin dashboard, coaches → the coach workspace, Link Positively
 * participants (and control) → the wall, Peer Navigation-only participants →
 * their coaching area. Decided by role, not permission: coaches also hold
 * `admin.access` (for a few shared staff pages) but work in /coach.
 */
export function homePathFor(roles: readonly Role[]) {
  const has = (role: Role) => roles.includes(role);
  if (has("admin") || has("research_admin") || has("coordinator")) return "/admin";
  if (has("coach")) return "/coach";
  if (has("participant") || has("control")) return "/";
  if (has("ecoach_user")) return "/coaching";
  return "/";
}
