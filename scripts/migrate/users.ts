import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { LEGACY_AVATAR_FILES, LEGACY_BADGE_FILES } from "@/features/gamification/catalog";
import { normalizePhone } from "@/features/profile/phone";
import { isDrupalHash } from "@/server/auth/drupal-password";
import { LEGACY_ROLE_MAP, serializeRoles, type Role } from "@/server/auth/roles";
import { accounts, COLOR_THEMES, profiles, users, type UserLegacy } from "@/server/db/schema";
import { q, type Ctx } from "./lib/context";
import { decodeEntities, fv, int, loadFields, localMidnight, str, ts, type FieldValues } from "./lib/drupal";
import { keepOrUpload } from "./lib/files";
import { legacy, upsertRows } from "./lib/upsert";
import { userMap } from "./lib/user-map";

/**
 * Users, roles, passwords and profiles (both sites).
 *
 * Identity: Peer Navigation accounts were created by CAS from LP logins, so
 * one person can have an LP uid and a PN uid. A PN account is merged into an
 * LP account when (in order):
 *   1. `cas_user.cas_name` equals the LP username (case-insensitive) — "cas";
 *   2. the PN username equals the LP username — "username+email" when the
 *      emails also match, else "username";
 *   3. the PN email equals the LP email — "email".
 * Merged users get `legacy = { site: "lp", id: lpUid, lpUid, pnUid, match }`
 * and programs from both sites; LP is the identity provider, so its username,
 * email, password hash, timezone and status win. Unmatched PN accounts become
 * Peer Navigation-only users (`legacy.site = "peernav"`).
 */

const LP_SITE_TIMEZONE = "America/Los_Angeles";
const PN_SITE_TIMEZONE = "America/New_York";

/** Peer Navigation role names mean something else than on LP ("participant" = coached person). */
const PN_ROLE_MAP: Record<string, Role | null> = {
  administrator: "admin",
  coordinator: "coordinator",
  coach: "coach",
  participant: "ecoach_user",
  "tech-participant": "ecoach_user",
};

type DrupalUser = {
  uid: number;
  name: string;
  pass: string;
  mail: string;
  created: number;
  access: number;
  login: number;
  status: number;
  timezone: string | null;
  picture: number;
  init: string;
};

type Person = {
  lp?: DrupalUser;
  pn?: DrupalUser;
  match?: "cas" | "username+email" | "username" | "email";
  roles: Role[];
  legacyRoles: { lp: string[]; peernav: string[] };
};

function programsFor(roles: Role[], person: Person): ("lp" | "peernav")[] {
  // Same rule as features/admin/accounts.ts programsFor, plus the sites the person had an account on.
  const programs = new Set<"lp" | "peernav">();
  if (roles.some((role) => ["admin", "research_admin", "coordinator", "participant", "control"].includes(role))) programs.add("lp");
  if (roles.some((role) => ["admin", "coordinator", "coach", "ecoach_user"].includes(role))) programs.add("peernav");
  if (person.pn) programs.add("peernav");
  if (person.lp && person.pn) programs.add("lp");
  if (!programs.size) programs.add(person.lp ? "lp" : "peernav");
  return (["lp", "peernav"] as const).filter((p) => programs.has(p));
}

async function loadSite(pool: Ctx["lp"]) {
  const rows = await q<DrupalUser>(
    pool,
    "select uid, name, pass, mail, created, access, login, status, timezone, picture, init from users where uid > 0 order by uid",
  );
  const roleRows = await q<{ uid: number; name: string }>(pool, "select ur.uid, r.name from users_roles ur join role r using (rid)");
  const roles = new Map<number, string[]>();
  for (const row of roleRows) (roles.get(row.uid) ?? roles.set(row.uid, []).get(row.uid)!).push(row.name);
  return { users: rows, roles };
}

export async function migrateUsers(ctx: Ctx) {
  const lp = await loadSite(ctx.lp);
  const pn = await loadSite(ctx.pn);
  ctx.stats.source("users (lp)", lp.users.length);
  ctx.stats.source("users (peernav)", pn.users.length);

  // ---- identity matching ----
  const cas = await q<{ uid: number; cas_name: string }>(ctx.pn, "select uid, cas_name from cas_user");
  const casByUid = new Map(cas.map((row) => [Number(row.uid), row.cas_name]));
  const lpByName = new Map(lp.users.map((u) => [u.name.trim().toLowerCase(), u]));
  const lpByMail = new Map(lp.users.filter((u) => u.mail).map((u) => [u.mail.trim().toLowerCase(), u]));
  const people = new Map<number | string, Person>();
  for (const user of lp.users) {
    people.set(`lp:${user.uid}`, { lp: user, roles: [], legacyRoles: { lp: lp.roles.get(user.uid) ?? [], peernav: [] } });
  }
  const matchCounts: Record<string, number> = {};
  let unmatched = 0;
  for (const user of pn.users) {
    let match: Person["match"];
    let target: DrupalUser | undefined;
    const casName = casByUid.get(user.uid);
    if (casName && lpByName.has(casName.trim().toLowerCase())) {
      target = lpByName.get(casName.trim().toLowerCase());
      match = "cas";
    } else if (lpByName.has(user.name.trim().toLowerCase())) {
      target = lpByName.get(user.name.trim().toLowerCase());
      match = target!.mail.trim().toLowerCase() === user.mail.trim().toLowerCase() ? "username+email" : "username";
    } else if (user.mail && lpByMail.has(user.mail.trim().toLowerCase())) {
      target = lpByMail.get(user.mail.trim().toLowerCase());
      match = "email";
    }
    const person = target ? people.get(`lp:${target.uid}`) : undefined;
    if (person && !person.pn) {
      person.pn = user;
      person.match = match;
      person.legacyRoles.peernav = pn.roles.get(user.uid) ?? [];
      matchCounts[match!] = (matchCounts[match!] ?? 0) + 1;
    } else {
      if (person) ctx.stats.note("users (peernav)", `PN uid ${user.uid} matched an LP account already merged with another PN account; kept separate`);
      unmatched++;
      people.set(`pn:${user.uid}`, { pn: user, roles: [], legacyRoles: { lp: [], peernav: pn.roles.get(user.uid) ?? [] } });
    }
  }
  ctx.stats.note(
    "users (peernav)",
    `matched to LP accounts: ${Object.entries(matchCounts)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}; unmatched (Peer Navigation-only users): ${unmatched}`,
  );

  // ---- roles ----
  const droppedRoles: Record<string, number> = {};
  for (const person of people.values()) {
    const roles = new Set<Role>();
    for (const name of person.legacyRoles.lp) {
      const role = LEGACY_ROLE_MAP[name];
      if (role) roles.add(role);
      else droppedRoles[name] = (droppedRoles[name] ?? 0) + 1;
    }
    for (const name of person.legacyRoles.peernav) {
      const role = PN_ROLE_MAP[name];
      if (role) roles.add(role);
      else droppedRoles[`pn:${name}`] = (droppedRoles[`pn:${name}`] ?? 0) + 1;
    }
    // Randomization replaced control with participant; both together are stale data.
    if (roles.has("participant")) roles.delete("control");
    if (!roles.size) roles.add(person.lp ? "control" : "ecoach_user");
    person.roles = [...roles];
  }
  if (Object.keys(droppedRoles).length) {
    ctx.stats.note(
      "users (lp)",
      `Drupal roles not carried over (levels are computed from points): ${Object.entries(droppedRoles)
        .map(([k, v]) => `${k} ×${v}`)
        .join(", ")}`,
    );
  }

  // ---- user rows ----
  const rows = [...people.values()].map((person) => {
    const primary = person.lp ?? person.pn!;
    const site = person.lp ? "lp" : "peernav";
    const blocked = person.lp ? person.lp.status === 0 : person.pn!.status === 0;
    const legacyJson: UserLegacy = {
      site,
      table: "users",
      id: primary.uid,
      ...(person.lp ? { lpUid: person.lp.uid } : {}),
      ...(person.pn ? { pnUid: person.pn.uid } : {}),
      ...(person.match ? { match: person.match } : {}),
      roles: person.legacyRoles,
    };
    const timezone = person.lp?.timezone || person.pn?.timezone || (person.lp ? LP_SITE_TIMEZONE : PN_SITE_TIMEZONE);
    return {
      name: primary.name.trim(),
      email: (primary.mail || `${primary.name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, ".")}@legacy-${site}.invalid`).trim().toLowerCase(),
      emailVerified: true,
      username: primary.name.trim().toLowerCase(),
      displayUsername: primary.name.trim(),
      role: serializeRoles(person.roles),
      banned: blocked,
      banReason: blocked ? "Blocked on the old site" : null,
      timezone,
      programs: programsFor(person.roles, person),
      legacy: legacyJson,
      createdAt: ts(Math.min(...[person.lp?.created, person.pn?.created].filter((v): v is number => !!v))) ?? new Date(0),
    };
  });
  const noEmail = rows.filter((r) => r.email.endsWith(".invalid")).length;
  if (noEmail) ctx.stats.note("users (lp)", `${noEmail} accounts had no email; given a placeholder @legacy-*.invalid address`);
  const badUsername = rows.filter((r) => !/^[\p{L}\p{N} ._@'-]{2,60}$/u.test(r.displayUsername ?? "")).length;
  if (badUsername) ctx.stats.note("users (lp)", `${badUsername} usernames don't pass the app's username rule (they can still sign in by email)`);

  // Adopt accounts created in the new app before the migration (same email or username, no legacy link yet).
  if (!ctx.opts.dryRun) {
    const emails = rows.map((r) => r.email);
    const usernames = rows.map((r) => r.username);
    const existing = await ctx.db
      .select({ id: users.id, email: users.email, username: users.username })
      .from(users)
      .where(and(isNull(users.legacy), or(inArray(users.email, emails), inArray(users.username, usernames))));
    for (const row of existing) {
      const match = rows.find((r) => r.email === row.email || r.username === row.username);
      if (!match) continue;
      await ctx.db.update(users).set({ legacy: match.legacy }).where(eq(users.id, row.id));
      ctx.stats.note("users (lp)", `adopted an existing account (${row.id}) for legacy ${match.legacy.site} uid ${match.legacy.id}`);
    }
  }

  const statsName = "users";
  ctx.stats.source(statsName, rows.length);
  await upsertRows(ctx, statsName, users, rows, {
    target: [users.legacySite, users.legacyId],
    targetWhere: isNotNull(users.legacyId),
  });

  const map = await userMap(ctx, true);
  const idOf = (person: Person) => (person.lp ? map.lp.get(person.lp.uid) : map.pn.get(person.pn!.uid));

  // ---- credentials: keep the Drupal hash until the first sign-in upgrades it ----
  ctx.stats.source("accounts", people.size);
  let credInserted = 0;
  let credUpdated = 0;
  let credUnchanged = 0;
  let credUpgraded = 0;
  for (const person of people.values()) {
    const userId = idOf(person);
    if (!userId) continue;
    const hash = (person.lp ?? person.pn!).pass;
    if (!hash || !isDrupalHash(hash)) {
      ctx.stats.skip("accounts", "no Drupal password hash");
      continue;
    }
    if (ctx.opts.dryRun) continue;
    const [account] = await ctx.db
      .select({ id: accounts.id, password: accounts.password })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
      .limit(1);
    if (!account) {
      await ctx.db.insert(accounts).values({ userId, providerId: "credential", accountId: userId, password: hash });
      credInserted++;
    } else if (!account.password || (isDrupalHash(account.password) && account.password !== hash)) {
      await ctx.db.update(accounts).set({ password: hash }).where(eq(accounts.id, account.id));
      credUpdated++;
    } else {
      if (!isDrupalHash(account.password)) credUpgraded++;
      credUnchanged++;
    }
  }
  ctx.stats.written("accounts", { inserted: credInserted, updated: credUpdated, unchanged: credUnchanged });
  if (credUpgraded) ctx.stats.note("accounts", `${credUpgraded} accounts already signed in and have a modern hash (left alone)`);

  await migrateProfiles(ctx, people, idOf);
}

// ---------------------------------------------------------------------------
// Profiles

async function migrateProfiles(ctx: Ctx, people: Map<number | string, Person>, idOf: (person: Person) => string | undefined) {
  const lpUserFields = await loadFields(ctx.lp, "user", ["user"], [
    "field_first_name",
    "field_user_pronoun",
    "field_location",
    "field_coach",
    "field_zoom_link",
    "field_study_id",
    "field_number",
    "field_intervention_start_date",
    "field_role_changed_date",
    "field_weekly_sms_date_time",
    "field_sticker",
    "field_theme",
    "field_bg_image",
    "field_avatar",
    "field_wall_visit",
    "field_user_picture",
  ]);
  const pnUserFields = await loadFields(ctx.pn, "user", ["user"], [
    "field_first_name",
    "field_pronoun",
    "field_location",
    "field_coach",
    "field_zoom_link",
    "field_study_id",
    "field_about_me",
    "field_age",
    "field_on_prep",
    "field_participant_code",
  ]);
  const profile2 = await q<{ pid: number; uid: number; created: number; changed: number }>(
    ctx.lp,
    "select pid, uid, created, changed from profile where type = 'main'",
  );
  const profile2ByUid = new Map(profile2.map((p) => [Number(p.uid), p]));
  const profile2Fields = await loadFields(ctx.lp, "profile2", ["main"], ["field_about_me", "field_age", "field_pronoun"]);
  const avatars = await q<{ fid: number; avatar: string }>(ctx.lp, "select fid, avatar from avatar_selection");
  const avatarFile = new Map(avatars.map((a) => [Number(a.fid), a.avatar]));
  const twilio = await q<{ uid: number; number: string; country: string; status: number }>(
    ctx.lp,
    "select uid, number, country, status from twilio_user order by status desc",
  );
  const lastAccessVars = await q<{ name: string; value: Buffer }>(ctx.lp, "select name, value from variable where name like 'user_last_access_time%'");
  const lastAccess = new Map<number, number>();
  for (const row of lastAccessVars) {
    const uid = Number(row.name.replace("user_last_access_time", ""));
    const value = Number(/i:(\d+);|s:\d+:"(\d+)"/.exec(row.value.toString("utf8"))?.slice(1).find(Boolean));
    if (uid && value) lastAccess.set(uid, value);
  }

  const map = await userMap(ctx);
  const existing = new Map(
    (await ctx.db.select({ userId: profiles.userId, photoKey: profiles.photoKey }).from(profiles)).map((p) => [p.userId, p.photoKey]),
  );

  const rows = [];
  let unmappedAvatars = 0;
  let unmappedBadges = 0;
  for (const person of people.values()) {
    const userId = idOf(person);
    if (!userId) continue;
    const lpUid = person.lp?.uid;
    const pnUid = person.pn?.uid;
    const lpF = (field: string, column = "value") => (lpUid ? fv(lpUserFields, lpUid, field, column) : null);
    const pnF = (field: string, column = "value") => (pnUid ? fv(pnUserFields, pnUid, field, column) : null);
    const p2 = lpUid ? profile2ByUid.get(lpUid) : undefined;
    const p2F = (field: string) => (p2 ? fv(profile2Fields as FieldValues, Number(p2.pid), field) : null);
    const timezone = person.lp?.timezone || person.pn?.timezone || (person.lp ? LP_SITE_TIMEZONE : PN_SITE_TIMEZONE);

    const avatarFid = int(lpF("field_avatar"));
    const avatarName = avatarFid ? avatarFile.get(avatarFid) : undefined;
    const avatarId = avatarName ? LEGACY_AVATAR_FILES[avatarName] ?? null : null;
    if (avatarFid && !avatarId) unmappedAvatars++;
    const badges: string[] = [];
    for (const fid of String(lpF("field_sticker") ?? "")
      .split(",")
      .map((v) => Number(v.trim()))
      .filter(Boolean)) {
      const id = LEGACY_BADGE_FILES[avatarFile.get(fid) ?? ""];
      if (id && !badges.includes(id)) badges.push(id);
      else if (!id) unmappedBadges++;
    }

    // Custom photo (LP field_user_picture holds a fid as text); PN-only users keep their PN picture.
    const photoFid = int(lpF("field_user_picture")) ?? (!person.lp && person.pn?.picture ? Number(person.pn.picture) : null);
    const photo = await keepOrUpload(ctx, existing.get(userId), person.lp && int(lpF("field_user_picture")) ? "lp" : "peernav", photoFid, `profile-photos/${userId}`);

    const phoneRow = lpUid ? twilio.find((t) => Number(t.uid) === lpUid) : undefined;
    const phoneRaw = str(lpF("field_number")) ?? (phoneRow ? `+${phoneRow.country}${phoneRow.number}` : null);
    const phone = phoneRaw ? normalizePhone(phoneRaw) : null;

    const coachLp = int(lpF("field_coach", "target_id"));
    const coachPn = int(pnF("field_coach", "target_id"));
    const coachId = (coachLp ? map.lp.get(coachLp) : undefined) ?? (coachPn ? map.pn.get(coachPn) : undefined) ?? null;

    const aboutRaw = str(p2F("field_about_me")) ?? str(pnF("field_about_me"));
    const ageRaw = int(p2F("field_age")) ?? int(pnF("field_age"));
    const theme = str(lpF("field_theme"));
    const onPrep = pnF("field_on_prep");
    const access = Math.max(person.lp?.access ?? 0, person.pn?.access ?? 0, lpUid ? lastAccess.get(lpUid) ?? 0 : 0);

    const extra: Record<string, unknown> = {};
    if (person.lp) {
      extra.lp = {
        uid: person.lp.uid,
        login: ts(person.lp.login)?.toISOString() ?? null,
        access: ts(person.lp.access)?.toISOString() ?? null,
        pictureFid: person.lp.picture || null,
        avatarFid,
        bgImageFid: int(lpF("field_bg_image", "fid")),
        weeklySmsDateTime: str(lpF("field_weekly_sms_date_time")),
        profile2Pronoun: str(p2F("field_pronoun")),
        interventionStartDateRaw: str(lpF("field_intervention_start_date")),
        twilioStatus: phoneRow ? Number(phoneRow.status) : null,
      };
    }
    if (person.pn) {
      extra.peernav = {
        uid: person.pn.uid,
        login: ts(person.pn.login)?.toISOString() ?? null,
        access: ts(person.pn.access)?.toISOString() ?? null,
        pictureFid: person.pn.picture || null,
        firstName: str(pnF("field_first_name")),
        pronoun: str(pnF("field_pronoun")),
        location: str(pnF("field_location")),
        studyId: str(pnF("field_study_id")),
        zoomLink: str(pnF("field_zoom_link")),
        coachUid: coachPn,
      };
    }

    rows.push({
      userId,
      firstName: str(lpF("field_first_name")) ?? str(pnF("field_first_name")),
      pronouns: str(lpF("field_user_pronoun")) ?? str(p2F("field_pronoun")) ?? str(pnF("field_pronoun")),
      location: str(lpF("field_location")) ?? str(pnF("field_location")),
      aboutMe: aboutRaw ? decodeEntities(aboutRaw.replace(/<[^>]*>/g, " ")).replace(/[ \t]+/g, " ").trim() : null,
      age: ageRaw !== null && ageRaw >= 0 && ageRaw <= 120 ? ageRaw : null,
      avatarId,
      photoKey: photo?.key ?? existing.get(userId) ?? null,
      badges,
      colorTheme: (COLOR_THEMES as readonly string[]).includes(theme ?? "") ? (theme as (typeof COLOR_THEMES)[number]) : "theme-1",
      studyId: str(lpF("field_study_id")) ?? str(pnF("field_study_id")),
      phone,
      interventionStartDate: localMidnight(lpF("field_intervention_start_date"), timezone),
      roleChangedAt: ts(lpF("field_role_changed_date")),
      coachId,
      zoomLink: str(lpF("field_zoom_link")) ?? str(pnF("field_zoom_link")),
      onPrep: onPrep === null ? null : Number(onPrep) === 1,
      participantCode: str(pnF("field_participant_code")),
      lastWallVisitAt: ts(lpF("field_wall_visit")),
      lastActiveAt: ts(access),
      extra,
      ...legacy(person.lp ? "lp" : "peernav", "users", (person.lp ?? person.pn!).uid),
      createdAt: ts(p2?.created) ?? ts((person.lp ?? person.pn!).created) ?? new Date(0),
    });
  }
  if (unmappedAvatars) ctx.stats.note("profiles", `${unmappedAvatars} selected library avatars have no equivalent in the new catalog (left unset)`);
  if (unmappedBadges) ctx.stats.note("profiles", `${unmappedBadges} selected badges have no equivalent in the new catalog (dropped)`);
  ctx.stats.source("profiles", rows.length);
  await upsertRows(ctx, "profiles", profiles, rows, { target: [profiles.userId] });

}
