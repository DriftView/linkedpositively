/**
 * Creates local test accounts (never run against production).
 *
 *   pnpm seed
 *
 * Every account's password is "password123".
 */
import { eq } from "drizzle-orm";
import { createAccount } from "@/server/auth/accounts";
import type { Role } from "@/server/auth/roles";
import { db, pgClient } from "@/server/db/client";
import { users } from "@/server/db/schema/auth";

if (process.env.NODE_ENV === "production" || process.env.DELIVERY_MODE === "live") {
  console.error("Refusing to seed: this looks like a production environment.");
  process.exit(1);
}

const accounts: { username: string; name: string; roles: Role[]; programs?: ("lp" | "peernav")[] }[] = [
  { username: "admin", name: "Avery Admin", roles: ["admin"], programs: ["lp", "peernav"] },
  { username: "research", name: "Riley Research", roles: ["research_admin"] },
  { username: "coordinator", name: "Casey Coordinator", roles: ["coordinator"], programs: ["lp", "peernav"] },
  { username: "coach", name: "Jordan Coach", roles: ["coach"], programs: ["peernav"] },
  { username: "participant", name: "Sam Participant", roles: ["participant"] },
  { username: "both", name: "Morgan Both", roles: ["participant", "ecoach_user"], programs: ["lp", "peernav"] },
  { username: "pnonly", name: "Taylor PN", roles: ["ecoach_user"], programs: ["peernav"] },
  { username: "control", name: "Quinn Control", roles: ["control"] },
];

for (const account of accounts) {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, account.username)).limit(1);
  if (existing) {
    console.log(`exists  ${account.username}`);
    continue;
  }
  await createAccount({ ...account, email: `${account.username}@example.test`, password: "password123" });
  console.log(`created ${account.username} (${account.roles.join(", ")})`);
}
await pgClient.end();
process.exit(0);
