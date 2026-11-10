// Permission checks: Jonathan writes these (see CLAUDE.md).
//
// Each check answers "may this user do this?" with no side effects, so it can
// be unit-tested without a database. Callers (scripts, server actions) load the
// user, call the check, and only then change anything.

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
