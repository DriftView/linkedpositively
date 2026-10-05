"use server";

import { z } from "zod";
import { searchTips } from "@/features/tips/queries";
import { authedAction } from "@/server/actions/safe-action";
import { AuthError, can } from "@/server/auth/session";
import { searchPosts } from "./queries";

/** "Show more" for either result list. */
export const moreResults = authedAction
  .inputSchema(z.object({ q: z.string().trim().min(1).max(200), kind: z.enum(["posts", "tips"]), page: z.number().int().min(2).max(100) }))
  .action(async ({ parsedInput, ctx: { viewer } }) => {
    if (!can(viewer, "community.post")) throw new AuthError();
    if (parsedInput.kind === "posts") {
      const result = await searchPosts(viewer, parsedInput.q, { page: parsedInput.page });
      return { posts: result.items, tips: [], pageCount: result.pageCount };
    }
    if (!can(viewer, "tips.view")) return { posts: [], tips: [], pageCount: 0 };
    const result = await searchTips(viewer, parsedInput.q, { page: parsedInput.page });
    return { posts: [], tips: result.items, pageCount: result.pageCount };
  });
