// Unit tests for canBecomeAdmin. They fail until Jonathan implements it.
//
// A permission check is a plain function of the user, so these need no
// database: they run in milliseconds on every commit.
import { describe, expect, it } from "vitest";

import { canBecomeAdmin } from "./permissions";

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
