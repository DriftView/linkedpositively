import "server-only";
import type { Viewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { auditLog, type AuditAction } from "@/server/db/schema";
import { logger } from "@/server/logger";

/**
 * Records a staff action. Never throws: an audit failure is logged but must
 * not undo the action the staff member already completed.
 */
export async function audit(input: {
  actor: Pick<Viewer, "id" | "impersonatedBy"> | null;
  action: AuditAction;
  targetIds?: string[];
  summary: string;
  meta?: Record<string, string | number | boolean | null | string[]>;
}) {
  try {
    await db.insert(auditLog).values({
      actorId: input.actor ? input.actor.id : null,
      impersonatedBy: input.actor?.impersonatedBy ?? null,
      action: input.action,
      targetIds: input.targetIds ?? [],
      summary: input.summary.slice(0, 300),
      meta: input.meta,
    });
  } catch (error) {
    logger.error({ action: input.action, err: (error as Error).message }, "audit write failed");
  }
}
