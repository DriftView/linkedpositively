import { supportTickets } from "@/server/db/schema";
import { toPlainText } from "@/server/services/sanitize";
import { nodes } from "./content";
import type { Ctx } from "./lib/context";
import { fv, loadFields, str, ts } from "./lib/drupal";
import { legacy, upsertRows } from "./lib/upsert";
import { userMap } from "./lib/user-map";

/** Tech support requests (node type tech_support, body in field_body). The snapshot has none. */
export async function migrateSupport(ctx: Ctx) {
  const rows = await nodes(ctx, ctx.lp, ["tech_support"]);
  ctx.stats.source("support_tickets", rows.length);
  const fields = await loadFields(ctx.lp, "node", ["tech_support"], ["field_body"]);
  const map = await userMap(ctx);
  const out = [];
  for (const node of rows) {
    const userId = map.lp.get(node.uid);
    if (!userId) {
      ctx.stats.skip("support_tickets", "user not migrated (deleted account)");
      continue;
    }
    out.push({
      userId,
      title: node.title || "Tech Support Feedback",
      body: toPlainText(str(fv(fields, node.nid, "field_body")) ?? ""),
      // The old site had no workflow: every request is treated as handled.
      status: "resolved" as const,
      resolvedAt: ts(node.changed),
      ...legacy("lp", "node", node.nid),
      createdAt: ts(node.created) ?? new Date(0),
      updatedAt: ts(node.changed) ?? new Date(0),
    });
  }
  await upsertRows(ctx, "support_tickets", supportTickets, out);
}
