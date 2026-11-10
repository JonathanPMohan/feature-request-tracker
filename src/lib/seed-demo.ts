import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { auth } from "@/lib/auth";
import { DEMO_ACCOUNT } from "@/lib/demo-account";

export type SeedDemoResult = "created" | "already-exists";

/**
 * Makes sure the demo account exists and is flagged as the demo. Safe to run
 * any number of times ("idempotent"), so it runs on every deploy.
 */
export async function seedDemoAccount(): Promise<SeedDemoResult> {
  const existing = await findDemo();

  if (!existing) {
    // Created through Better Auth, exactly like a real sign-up, so the
    // password is hashed the same way and the account row is the same shape.
    // Called directly (not over HTTP), so the sign-up rate limit doesn't apply.
    await auth.api.signUpEmail({
      body: {
        name: DEMO_ACCOUNT.name,
        email: DEMO_ACCOUNT.email,
        password: DEMO_ACCOUNT.password,
      },
      headers: thisDeploymentHost(),
    });
  }

  // `isDemo` has `input: false`, so sign-up can't set it. Server code sets it
  // here instead. If the account were somehow an admin, the database CHECK
  // rejects this, and the seed fails loudly rather than leave a demo admin.
  await db
    .update(user)
    .set({ isDemo: true })
    .where(eq(user.email, DEMO_ACCOUNT.email));

  return existing ? "already-exists" : "created";
}

/**
 * Better Auth needs to know which site it's acting for. With BETTER_AUTH_URL
 * set (local, CI, production), that's fixed and these headers are ignored.
 * Vercel previews leave it unset, and Better Auth takes the address from each
 * request's hostname. A script has no request, so it supplies the hostname of
 * the deployment being built: Vercel sets VERCEL_URL during every build, and
 * it matches the allowed preview hostnames in auth-options.ts.
 *
 * (Better Auth's other suggestion, a `fallback` baseURL, would also apply to
 * real requests from unknown hostnames, so it isn't used.)
 */
function thisDeploymentHost(): Headers | undefined {
  const host = process.env.VERCEL_URL;
  return host ? new Headers({ host }) : undefined;
}

async function findDemo() {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, DEMO_ACCOUNT.email));
  return row;
}
