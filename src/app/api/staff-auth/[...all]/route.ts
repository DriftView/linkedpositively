import { toNextJsHandler } from "better-auth/next-js";
import { staffAuth } from "@/server/auth/auth";

/** Better Auth endpoints for the staff portal (the member portal's are at /api/auth). */
export const { GET, POST } = toNextJsHandler(staffAuth);
