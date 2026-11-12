// Permission checks: Jonathan writes these (see CLAUDE.md).
//
// Each check answers "may this user do this?" with no side effects, so it can
// be unit-tested without a database. Callers (scripts, server actions) load the
// user, call the check, and only then change anything.

// `import type` is erased when compiled, so this file still imports nothing at
// runtime (session.ts itself is server-only).
import type { CurrentUser } from "./session";

/**
 * May this account be promoted to admin? (M3 step 6, used by `make-admin`.)
 *
 * Spec: docs/specs/m3-make-admin.md. Tests: permissions.test.ts.
 */
export function canBecomeAdmin(user: {
  role: "user" | "admin";
  isDemo: boolean;
}): boolean {
  return !user.isDemo;
}

/**
 * May this person submit a feature request? (M5, used by the submit action.)
 *
 * `null` is a visitor who isn't signed in. Spec: docs/specs/m5-submit-and-browse.md
 * ("Your two pieces"). Tests: permissions.test.ts.
 *
 * The return type `user is CurrentUser` is a TypeScript "type predicate":
 * after `if (!canSubmitRequest(user)) return ...`, TypeScript knows `user`
 * isn't null, so the action can use `user.id` without another check.
 */
export function canSubmitRequest(
  user: CurrentUser | null,
): user is CurrentUser {
  return user !== null;
}
