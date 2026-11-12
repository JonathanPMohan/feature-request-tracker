// Integration tests for the per-user rate limit (spec S12 to S16), against the
// real action_rate_limit table. The interesting part is S13: that the limit
// holds when many requests arrive at the same moment.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";

import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitMessage,
  type RateLimitedAction,
} from "./rate-limit";

let counter = 0;
async function createUser() {
  counter += 1;
  const id = `rate-user-${counter}`;
  await db.execute(
    sql`insert into "user" (id, name, email)
        values (${id}, 'Test User', ${`${id}@example.com`})`,
  );
  return id;
}

// Uses up `times` attempts one after another, returning how many were allowed.
async function attempt(
  userId: string,
  action: RateLimitedAction,
  times: number,
) {
  let allowed = 0;
  for (let i = 0; i < times; i++) {
    if ((await consumeRateLimit(userId, action)).allowed) allowed += 1;
  }
  return allowed;
}

async function storedCount(userId: string, action: RateLimitedAction) {
  const { rows } = await db.execute<{ count: number }>(
    sql`select count from action_rate_limit
        where user_id = ${userId} and action = ${action}`,
  );
  return rows[0]?.count;
}

// Moves the user's current window into the past, as if time had passed.
// Faster and more reliable than waiting, and it tests the real SQL.
async function windowStartedAgo(
  userId: string,
  action: RateLimitedAction,
  seconds: number,
) {
  await db.execute(
    sql`update action_rate_limit
        set window_start = now() - make_interval(secs => ${seconds})
        where user_id = ${userId} and action = ${action}`,
  );
}

describe("consumeRateLimit", () => {
  const { max, windowSeconds } = RATE_LIMITS.submit;

  // S12, both sides of the limit.
  it("allows 10 submits in an hour, then refuses the 11th", async () => {
    const user = await createUser();

    expect(await attempt(user, "submit", max)).toBe(max);
    expect(await consumeRateLimit(user, "submit")).toEqual({
      allowed: false,
      retryAfterSeconds: expect.any(Number),
    });
  });

  // S14: refusals don't count. Otherwise someone who keeps clicking while
  // limited would push their own wait further and further out.
  it("doesn't count refused attempts", async () => {
    const user = await createUser();
    await attempt(user, "submit", max + 5);

    expect(await storedCount(user, "submit")).toBe(max);
  });

  // S13: THE test for the atomic statement. 15 calls are started at once,
  // without waiting for each other, so they reach Postgres together (the pool
  // runs up to 10 at the same moment). A "read, check, write" version lets
  // more than 10 through here, because several calls read the same count.
  it("lets exactly 10 through when 15 arrive at the same moment", async () => {
    const user = await createUser();

    const results = await Promise.all(
      Array.from({ length: 15 }, () => consumeRateLimit(user, "submit")),
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(max);
    expect(await storedCount(user, "submit")).toBe(max);
  });

  // The same race on the very first attempt, when there's no row yet: two
  // inserts collide, and ON CONFLICT turns the loser into an update.
  it("counts every attempt when a new user's first ones arrive together", async () => {
    const user = await createUser();

    const results = await Promise.all(
      Array.from({ length: 5 }, () => consumeRateLimit(user, "submit")),
    );

    expect(results.every((r) => r.allowed)).toBe(true);
    expect(await storedCount(user, "submit")).toBe(5);
  });

  // S16: when the hour is over, the count starts again.
  it("starts a new window once the old one is over", async () => {
    const user = await createUser();
    await attempt(user, "submit", max);
    await windowStartedAgo(user, "submit", windowSeconds + 1);

    expect((await consumeRateLimit(user, "submit")).allowed).toBe(true);
    // A fresh window holds this one attempt, not 11.
    expect(await storedCount(user, "submit")).toBe(1);
  });

  // Control case for the window: 1 second before the end, still refused. A
  // reversed comparison (< instead of <=, or the wrong sign) would fail here
  // or above.
  it("still refuses just before the window is over", async () => {
    const user = await createUser();
    await attempt(user, "submit", max);
    await windowStartedAgo(user, "submit", windowSeconds - 60);

    const result = await consumeRateLimit(user, "submit");
    expect(result).toEqual({
      allowed: false,
      retryAfterSeconds: expect.any(Number),
    });
    // About a minute left in the window.
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(55);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });

  it("says when to try again: the end of the current window", async () => {
    const user = await createUser();
    await attempt(user, "submit", max);
    await windowStartedAgo(user, "submit", 20 * 60);

    const result = await consumeRateLimit(user, "submit");
    // 40 minutes left, allowing a few seconds for the test itself.
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(40 * 60 - 10);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(40 * 60);
    }
  });

  // S16: one user's limit is theirs alone. (The demo account is one user, so
  // everyone using it shares one limit: accepted in PLAN.md.)
  it("limits each user separately", async () => {
    const busy = await createUser();
    const other = await createUser();
    await attempt(busy, "submit", max + 1);

    expect((await consumeRateLimit(other, "submit")).allowed).toBe(true);
  });

  // S16: and each action separately. Submitting 10 requests mustn't stop
  // someone voting.
  it("limits each action separately", async () => {
    const user = await createUser();
    await attempt(user, "submit", max + 1);

    expect((await consumeRateLimit(user, "vote")).allowed).toBe(true);
    expect((await consumeRateLimit(user, "comment")).allowed).toBe(true);
  });

  // The other actions' limits come from the same table and statement. One
  // check each that the numbers from PLAN.md are wired up.
  it.each([
    ["vote", 60],
    ["comment", 20],
  ] as const)("allows %s up to %i", async (action, limit) => {
    const user = await createUser();
    expect(await attempt(user, action, limit + 1)).toBe(limit);
  });
});

describe("rateLimitMessage", () => {
  // Decision B: say when to come back, in whole minutes, rounded up.
  it.each([
    [1, "Try again in 1 minute."],
    [60, "Try again in 1 minute."],
    [61, "Try again in 2 minutes."],
    [40 * 60, "Try again in 40 minutes."],
  ])("for %i seconds: %s", (seconds, ending) => {
    expect(rateLimitMessage(seconds)).toBe(
      `You've reached the limit for now. ${ending}`,
    );
  });

  it("never says 0 minutes", () => {
    expect(rateLimitMessage(0)).toContain("1 minute.");
  });
});
