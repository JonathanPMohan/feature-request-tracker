// Permission checks: Jonathan writes these (see CLAUDE.md).
//
// Each check answers "may this user do this?" with no side effects, so it can
// be unit-tested without a database. Callers (scripts, server actions) load the
// user, call the check, and only then change anything.

// `import type` is erased when compiled, so this file still imports nothing at
// runtime (session.ts itself is server-only).
import type { Status } from "./requests";
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

/**
 * May this person vote on (or take back a vote from) this request? (M6, used
 * by the vote action and to show the button.)
 *
 * Spec: docs/specs/m6-voting.md: "Your two pieces", and decisions A (only
 * active requests) and B (not the demo account). Tests: permissions.test.ts.
 *
 * A plain boolean, NOT a type predicate like canSubmitRequest's. A predicate
 * also speaks when it's false: `false` would tell TypeScript "this user is
 * not a CurrentUser", i.e. a visitor. That's true for canSubmitRequest, but
 * canVote refuses signed-in users too (the demo account, a shipped request),
 * so here it would be a lie the compiler believes.
 */
export function canVote(
  user: CurrentUser | null,
  request: { status: Status },
): boolean {
  if (user === null) {
    return false; // visitors must sign in
  }
  if (user.isDemo) {
    return false; // the shared demo account can't vote
  }
  const votingOpen =
    request.status === "open" ||
    request.status === "planned" ||
    request.status === "in_progress";
  if (!votingOpen) {
    return false; // only active requests take votes; new statuses stay closed until decided
  }
  return true;
}

/**
 * May this person comment on this request? (M7, used by the comment action
 * and to show the form.)
 *
 * Spec: docs/specs/m7-comments.md: "Your pieces", and decisions A (any
 * status) and B (not the demo account). Tests: permissions.test.ts.
 *
 * Returns boolean, not a type predicate: decision B refuses a signed-in
 * user (Jonathan's call, for the reason M6 found).
 */
export function canComment(
  user: CurrentUser | null,
  _request: { status: Status },
): boolean {
  if (user === null) {
    return false; // visitors can't comment, even on open requests
  }
  if (user.isDemo) {
    return false; // the shared demo account can't comment
  }
  return true;
}
