import "server-only";
import { createSafeActionClient } from "next-safe-action";
import { AuthError, getViewer } from "@/server/auth/session";
import { hasPermission, type Permission } from "@/server/auth/roles";
import { logger } from "@/server/logger";

/** Errors whose message is safe to show to the user. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

/**
 * Base client for Server Actions: validates input with Zod and turns
 * unexpected errors into a generic message (details go to
 * the log, never to the browser).
 */
export const actionClient = createSafeActionClient({
  handleServerError(error) {
    if (error instanceof UserFacingError || error instanceof AuthError) return error.message;
    logger.error({ err: error.message, stack: error.stack }, "server action failed");
    return "Something went wrong. Please try again.";
  },
});

/** Requires a signed-in user; exposes them as `ctx.viewer`. */
export const authedAction = actionClient.use(async ({ next }) => {
  const viewer = await getViewer();
  if (!viewer) throw new AuthError("Please sign in again.");
  return next({ ctx: { viewer } });
});

/** Requires a signed-in user holding `permission`. */
export function permissionAction(permission: Permission) {
  return authedAction.use(async ({ next, ctx }) => {
    if (!hasPermission(ctx.viewer.roles, permission)) throw new AuthError();
    return next();
  });
}
