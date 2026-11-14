// Unit tests for the permission checks in permissions.ts.
//
// A permission check is a plain function of the user, so these need no
// database: they run in milliseconds on every commit.
import { describe, expect, it } from "vitest";

import {
  canBecomeAdmin,
  canComment,
  canSubmitRequest,
  canVote,
} from "./permissions";

describe("canBecomeAdmin", () => {
  it("allows a normal account", () => {
    expect(canBecomeAdmin({ role: "user", isDemo: false })).toBe(true);
  });

  // The rule from docs/PLAN.md. The database refuses this too (CHECK
  // user_demo_not_admin); this check means the script refuses first, with a
  // clear message instead of a database error.
  it("refuses the demo account", () => {
    expect(canBecomeAdmin({ role: "user", isDemo: true })).toBe(false);
  });

  // Promoting an admin again changes nothing, so it isn't refused. The
  // make-admin script reports "already an admin" instead.
  it("allows an account that is already an admin", () => {
    expect(canBecomeAdmin({ role: "admin", isDemo: false })).toBe(true);
  });
});

// Unit tests for canSubmitRequest (M5), written before Jonathan implemented it.
describe("canSubmitRequest", () => {
  const signedIn = {
    id: "user-1",
    name: "Ada",
    email: "ada@example.com",
    role: "user",
    isDemo: false,
  } as const;

  // PLAN.md: submitting requires sign-in. The action also proves this end to
  // end (actions.int.test.ts); this is the rule on its own.
  it("refuses a visitor", () => {
    expect(canSubmitRequest(null)).toBe(false);
  });

  it("allows a signed-in user", () => {
    expect(canSubmitRequest(signedIn)).toBe(true);
  });

  it("allows an admin", () => {
    expect(canSubmitRequest({ ...signedIn, role: "admin" })).toBe(true);
  });

  // Reviewers use the demo account to try the app, so it must be able to
  // submit. (Its abuse is capped by the shared rate limit.)
  it("allows the demo account", () => {
    expect(canSubmitRequest({ ...signedIn, isDemo: true })).toBe(true);
  });
});

// Unit tests for canVote (M6), written before Jonathan implements it. They
// follow his decisions A (only active requests) and B (no demo voting).
describe("canVote", () => {
  const user = {
    id: "user-1",
    name: "Ada",
    email: "ada@example.com",
    role: "user",
    isDemo: false,
  } as const;
  const open = { status: "open" } as const;

  it("refuses a visitor", () => {
    expect(canVote(null, open)).toBe(false);
  });

  it.each(["open", "planned", "in_progress"] as const)(
    "allows a signed-in user on a %s request",
    (status) => {
      expect(canVote(user, { status })).toBe(true);
    },
  );

  // Decision A: votes help decide, so they stop once a request is decided.
  it.each(["shipped", "declined"] as const)(
    "refuses everyone on a %s request",
    (status) => {
      expect(canVote(user, { status })).toBe(false);
      expect(canVote({ ...user, role: "admin" }, { status })).toBe(false);
    },
  );

  // Admins vote like anyone else; their power is changing status (M8).
  it("allows an admin on an active request", () => {
    expect(canVote({ ...user, role: "admin" }, open)).toBe(true);
  });

  // Decision B: everyone shares the demo account, so its vote would be one
  // shared, confusing vote on the real board.
  it("refuses the demo account, even on an active request", () => {
    expect(canVote({ ...user, isDemo: true }, open)).toBe(false);
  });
});

// Unit tests for canComment (M7), written before Jonathan implements it. They
// follow his decisions A (comments on any status) and B (no demo comments).
describe("canComment", () => {
  const user = {
    id: "user-1",
    name: "Ada",
    email: "ada@example.com",
    role: "user",
    isDemo: false,
  } as const;
  const open = { status: "open" } as const;

  it("refuses a visitor", () => {
    expect(canComment(null, open)).toBe(false);
  });

  // Decision A: comments are a conversation that can continue after a
  // decision. The difference from canVote, which stops at shipped/declined.
  it.each(["open", "planned", "in_progress", "shipped", "declined"] as const)(
    "allows a signed-in user on a %s request",
    (status) => {
      expect(canComment(user, { status })).toBe(true);
    },
  );

  it("allows an admin", () => {
    expect(canComment({ ...user, role: "admin" }, open)).toBe(true);
  });

  // Decision B: a shared account's comments would be anonymous, and an easy
  // spam path. On every status, decided or not.
  it.each(["open", "shipped"] as const)(
    "refuses the demo account on a %s request",
    (status) => {
      expect(canComment({ ...user, isDemo: true }, { status })).toBe(false);
    },
  );
});
