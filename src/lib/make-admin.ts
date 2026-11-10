import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { canBecomeAdmin } from "@/lib/permissions";

export type MakeAdminResult =
  "promoted" | "already-admin" | "not-found" | "refused-demo";

/**
 * Promotes the account with this email to admin. Used by `npm run make-admin`.
 *
 * Two layers refuse the demo account: canBecomeAdmin (Jonathan's permission
 * check) refuses it here with a clear result, and if that ever had a bug, the
 * database CHECK `user_demo_not_admin` would still reject the update.
 */
export async function makeAdmin(email: string): Promise<MakeAdminResult> {
  // Better Auth stores emails in lowercase, so match the same way.
  const normalized = email.trim().toLowerCase();

  const [account] = await db
    .select({ id: user.id, role: user.role, isDemo: user.isDemo })
    .from(user)
    .where(eq(user.email, normalized));

  if (!account) return "not-found";

  // The database CHECK guarantees one of these two values.
  const role = account.role === "admin" ? "admin" : "user";

  if (!canBecomeAdmin({ role, isDemo: account.isDemo })) return "refused-demo";
  if (role === "admin") return "already-admin";

  await db.update(user).set({ role: "admin" }).where(eq(user.id, account.id));
  return "promoted";
}
