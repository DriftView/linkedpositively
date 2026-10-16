import { toNextJsHandler } from "better-auth/next-js";
import { memberAuth } from "@/server/auth/auth";

/** Better Auth endpoints for the member portal (the staff portal's are at /api/staff-auth). */
export const { GET, POST } = toNextJsHandler(memberAuth);
