import "server-only";
import type { NavGroup, NavItem } from "@/components/app/nav-types";
import { can, type Viewer } from "@/server/auth/session";

/**
 * Participant navigation (Drupal "Participant Menu": Home / Your Wall, Your
 * Tips, Your Trackers, Weekly Check-In, Your User, Resources, eCoach…),
 * filtered by what the viewer may open.
 */
export function participantNav(viewer: Viewer, counts: { wallNew?: number; tipsNew?: number } = {}): NavItem[] {
  const items: NavItem[] = [{ href: "/", label: "Home", icon: "home", primary: true, badge: counts.wallNew }];
  if (can(viewer, "ai.chat")) items.push({ href: "/ai-coach", label: "AI Coach", icon: "ai" });
  if (can(viewer, "tips.view")) items.push({ href: "/tips", label: "Tips", icon: "tips", primary: true, badge: counts.tipsNew });
  if (can(viewer, "tracker.use")) items.push({ href: "/tracker", label: "Tracker", icon: "tracker", primary: true });
  if (can(viewer, "checkin.weekly")) {
    items.push({ href: "/check-in", label: "Weekly check-in", icon: "checkin" });
    items.push({ href: "/surveys", label: "Surveys", icon: "survey" });
  }
  items.push({ href: "/profile", label: "Profile", icon: "profile", primary: true });
  if (can(viewer, "gamification.earn")) {
    items.push({ href: "/levels", label: "Levels & points", icon: "trophy" });
    items.push({ href: "/leaderboard", label: "Leaderboard", icon: "chart" });
  }
  if (can(viewer, "resources.view")) items.push({ href: "/resources", label: "Resources", icon: "resources" });
  if (can(viewer, "tracker.use")) items.push({ href: "/journey", label: "My journey", icon: "journey" });
  if (can(viewer, "peernav.participant")) items.push({ href: "/coaching", label: "Peer navigation", icon: "coaching" });
  items.push({ href: "/glossary", label: "Glossary", icon: "book" });
  items.push({ href: "/pages", label: "Help & info", icon: "help" });
  items.push({ href: "/support", label: "Tech support", icon: "support" });
  return items;
}

/** Peer Navigation participant area (Drupal PN "Participant Menu"). */
export function coachingNav(
  viewer: Viewer,
  counts: { unreadMessages?: number } = {},
  options: { hasZoom?: boolean } = {},
): NavItem[] {
  const items: NavItem[] = [
    { href: "/coaching", label: "Coaching plans", icon: "coaching", primary: true },
    { href: "/coaching/coach", label: "My coach", icon: "coach", primary: true },
    { href: "/coaching/messages", label: "Messages", icon: "messages", primary: true, badge: counts.unreadMessages },
    { href: "/coaching/files", label: "My files", icon: "files", primary: true },
  ];
  if (can(viewer, "ai.chat")) items.push({ href: "/coaching/ai-coach", label: "AI Coach", icon: "ai" });
  if (options.hasZoom) items.push({ href: "/coaching/zoom", label: "Launch Zoom", icon: "video", external: true });
  if (can(viewer, "lp.access")) items.push({ href: "/", label: "Link Positively", icon: "home" });
  return items;
}

/** Staff sidebar, grouped. Only groups with at least one visible item are returned. */
export function staffNav(viewer: Viewer, counts: { aiAlerts?: number } = {}): NavGroup[] {
  const groups: NavGroup[] = [];
  const add = (label: string, entries: (NavItem | false)[]) => {
    const items = entries.filter(Boolean) as NavItem[];
    if (items.length) groups.push({ label, items });
  };

  add("Overview", [
    can(viewer, "admin.access") && viewer.roles.some((role) => role !== "coach") && { href: "/admin", label: "Dashboard", icon: "dashboard" },
  ]);
  add("Peer Navigation", [
    can(viewer, "peernav.coach") && { href: "/coach", label: "Coach dashboard", icon: "coaching" },
    can(viewer, "peernav.messages") && { href: "/coach/messages", label: "Messages", icon: "messages" },
    can(viewer, "peernav.assignCoach") && { href: "/coach/relationships", label: "Coach assignments", icon: "link" },
    can(viewer, "peernav.sessionReport") && { href: "/admin/reports/sessions", label: "Session report", icon: "chart" },
    can(viewer, "peernav.sessionReport") && { href: "/admin/reports/peernav-usage", label: "Peer Navigation usage", icon: "chart" },
  ]);
  add("People", [
    can(viewer, "users.view") && { href: "/admin/users", label: "Users", icon: "users" },
    can(viewer, "users.create") && { href: "/admin/users/new", label: "Create participant", icon: "users" },
    can(viewer, "users.randomize") && { href: "/admin/randomization", label: "Randomization", icon: "shuffle" },
  ]);
  add("Content", [
    can(viewer, "content.manage") && { href: "/admin/content/tips", label: "Thrive Tips", icon: "tips" },
    can(viewer, "content.manage") && { href: "/admin/content/check-in", label: "Check-in prompts", icon: "checkin" },
    can(viewer, "resources.manage") && { href: "/admin/content/resources", label: "Resources", icon: "resources" },
    can(viewer, "content.manage") && { href: "/admin/content/pages", label: "Pages", icon: "content" },
    can(viewer, "content.manage") && { href: "/admin/content/glossary", label: "Glossary", icon: "book" },
    can(viewer, "content.manage") && { href: "/admin/content/journey", label: "Journey", icon: "journey" },
    can(viewer, "content.manage") && { href: "/admin/content/levels", label: "Levels", icon: "trophy" },
    can(viewer, "sms.manage") && { href: "/admin/content/sms", label: "SMS messages", icon: "sms" },
    can(viewer, "sms.manage") && { href: "/admin/content/sms/log", label: "SMS log", icon: "sms" },
  ]);
  add("Community", [
    can(viewer, "moderation.review") && { href: "/admin/moderation", label: "Moderation", icon: "flag" },
    can(viewer, "support.manage") && { href: "/admin/support", label: "Tech support", icon: "support" },
    can(viewer, "lp.access") && { href: "/", label: "Open the app", icon: "external" },
  ]);
  add("AI Coach", [
    (can(viewer, "ai.review") || can(viewer, "reports.view")) && { href: "/admin/ai", label: "Overview", icon: "ai" },
    can(viewer, "ai.review") && { href: "/admin/ai/alerts", label: "Safety alerts", icon: "alert", badge: counts.aiAlerts },
    can(viewer, "content.manage") && { href: "/admin/ai/knowledge", label: "Knowledge", icon: "book" },
    can(viewer, "ai.chat") && can(viewer, "lp.access") && { href: "/ai-coach", label: "Try the coach", icon: "external" },
  ]);
  add("Insights", [
    can(viewer, "reports.view") && { href: "/admin/reports", label: "Reports", icon: "chart" },
    can(viewer, "surveys.manage") && { href: "/admin/surveys", label: "Surveys", icon: "survey" },
  ]);
  add("System", [
    can(viewer, "users.edit") && { href: "/admin/audit", label: "Audit log", icon: "shield" },
    can(viewer, "settings.manage") && { href: "/admin/settings", label: "Settings", icon: "settings" },
  ]);
  return groups;
}
