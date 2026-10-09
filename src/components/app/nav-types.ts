/**
 * Navigation items are built on the server (filtered by the viewer's
 * permissions) and passed to client shells as plain data, so icons are
 * referenced by name rather than as components.
 */
export type NavIcon =
  | "home"
  | "tips"
  | "tracker"
  | "checkin"
  | "profile"
  | "resources"
  | "journey"
  | "trophy"
  | "bell"
  | "messages"
  | "coaching"
  | "files"
  | "coach"
  | "video"
  | "search"
  | "book"
  | "help"
  | "users"
  | "shield"
  | "flag"
  | "chart"
  | "settings"
  | "content"
  | "sms"
  | "survey"
  | "shuffle"
  | "dashboard"
  | "support"
  | "external"
  | "link"
  | "ai"
  | "alert";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Shown in the phone tab bar (max 4 + "More"). */
  primary?: boolean;
  external?: boolean;
  badge?: number;
  /** Small text marker for navigation items, such as a new feature. */
  tag?: string;
};

export type NavGroup = { label: string; items: NavItem[] };
