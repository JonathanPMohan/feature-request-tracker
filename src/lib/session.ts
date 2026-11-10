import "server-only";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";

// The only shape of "the current user" the rest of the app sees. Keeping it
// small means session tokens and other internals never reach a page or a
// client component by accident.
export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  isDemo: boolean;
};

/**
 * The signed-in user, or null for a visitor.
 *
 * Every page and server action reads the session through this function (the
 * "Data Access Layer" pattern from the Next.js auth guide). It reads the
 * request's cookies, so a component that calls it must sit inside <Suspense>.
 *
 * This only answers "who is this?". Whether they may do something is a
 * permission check, which lives in src/lib/permissions.ts.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const { id, name, email, role, isDemo } = session.user;
  return {
    id,
    name,
    email,
    // The database CHECK guarantees one of these two values.
    role: role === "admin" ? "admin" : "user",
    isDemo,
  };
}
