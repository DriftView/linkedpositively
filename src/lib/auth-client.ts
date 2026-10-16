import { createAuthClient } from "better-auth/react";
import { adminClient, usernameClient } from "better-auth/client/plugins";
import { PORTAL_AUTH_PATH, type Portal } from "./portal";

/** Member portal (participants). Signing in goes through /api/login for both portals. */
export const authClient = createAuthClient({
  basePath: PORTAL_AUTH_PATH.member,
  plugins: [usernameClient(), adminClient()],
});

/** Staff portal (staff, coordinators, peer navigators). */
export const staffAuthClient = createAuthClient({
  basePath: PORTAL_AUTH_PATH.staff,
  plugins: [usernameClient(), adminClient()],
});

export function authClientFor(portal: Portal) {
  return portal === "staff" ? staffAuthClient : authClient;
}

const AUTH_CHANNEL = "lp-auth";

/** Tells this browser's other tabs that a portal's session changed (see SessionGuard). */
export function announceAuthChange(portal: Portal) {
  try {
    const channel = new BroadcastChannel(AUTH_CHANNEL);
    channel.postMessage({ portal });
    channel.close();
  } catch {
    // Older browsers: the other tabs still re-check when they regain focus.
  }
}

export function onAuthChange(listener: (portal: Portal) => void) {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(AUTH_CHANNEL);
  channel.onmessage = (event: MessageEvent<{ portal?: Portal }>) => {
    if (event.data?.portal) listener(event.data.portal);
  };
  return () => channel.close();
}
