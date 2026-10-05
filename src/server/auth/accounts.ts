import "server-only";
import { auth } from "./auth";
import { serializeRoles, type Role } from "./roles";

export type NewAccount = {
  username: string;
  email: string;
  name?: string;
  /** Plain password to hash, or an existing hash (e.g. a Drupal $S$ hash from the migration). */
  password?: string;
  passwordHash?: string;
  roles: Role[];
  programs?: ("lp" | "peernav")[];
  timezone?: string;
  image?: string | null;
  banned?: boolean;
  legacy?: Record<string, unknown>;
  createdAt?: Date;
};

/**
 * Creates a user plus their password credential. Used by staff screens
 * ("Create a new participant"), the seed script and the data migration.
 */
export async function createAccount(input: NewAccount) {
  const ctx = await auth.$context;
  const username = input.username.trim().toLowerCase();
  const user = await ctx.internalAdapter.createUser(
    {
      email: input.email.trim().toLowerCase(),
      name: input.name?.trim() || input.username.trim(),
      username,
      displayUsername: input.username.trim(),
      emailVerified: true,
      image: input.image ?? null,
      role: serializeRoles(input.roles),
      banned: input.banned ?? false,
      programs: input.programs ?? ["lp"],
      timezone: input.timezone ?? "America/New_York",
      legacy: input.legacy,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    },
    { method: "admin" },
  );

  const password = input.passwordHash ?? (input.password ? await ctx.password.hash(input.password) : undefined);
  await ctx.internalAdapter.createAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password,
  });
  return user;
}
