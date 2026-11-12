// Integration tests for the vote action (spec V3, V4, V7 to V10), calling it
// directly with any arguments, the way a hand-made POST would. The database
// is real; only the session is faked (see M5's actions.int.test.ts for how).
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { createRequestWithVote, type Status } from "@/lib/requests";
import type { CurrentUser } from "@/lib/session";

import { setVoteAction } from "./vote-action";
import { VOTE_MESSAGES } from "./vote-state";

const fake = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/lib/session", () => ({ getCurrentUser: async () => fake.user }));

let counter = 0;
async function createUser(overrides: Partial<CurrentUser> = {}) {
  counter += 1;
  const user: CurrentUser = {
    id: `voter-${counter}`,
    name: "Voter",
    email: `voter-${counter}@example.com`,
    role: "user",
    isDemo: false,
    ...overrides,
  };
  await db.execute(
    sql`insert into "user" (id, name, email, is_demo)
        values (${user.id}, ${user.name}, ${user.email}, ${user.isDemo})`,
  );
  return user;
}

async function signInAs(overrides: Partial<CurrentUser> = {}) {
  fake.user = await createUser(overrides);
  return fake.user;
}

// Someone else's request, so it starts with exactly 1 vote.
async function createRequest(status: Status = "open") {
  const author = await createUser({ name: "Author" });
  const id = await createRequestWithVote({
    title: "Dark mode",
    description: "Please.",
    authorId: author.id,
  });
  await db.execute(
    sql`update feature_request set status = ${status} where id = ${id}`,
  );
  return id;
}

async function voteCount(requestId: number) {
  const { rows } = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from vote where request_id = ${requestId}`,
  );
  return rows[0].n;
}

async function quotaUsed() {
  const { rows } = await db.execute<{ n: number }>(
    sql`select coalesce(sum(count), 0)::int as n from action_rate_limit`,
  );
  return rows[0].n;
}

beforeEach(() => {
  fake.user = null;
});

describe("setVoteAction", () => {
  it("votes, and returns the new count", async () => {
    await signInAs();
    const request = await createRequest();

    expect(await setVoteAction(request, true)).toEqual({
      ok: true,
      voted: true,
      votes: 2,
    });
  });

  it("takes a vote back", async () => {
    await signInAs();
    const request = await createRequest();
    await setVoteAction(request, true);

    expect(await setVoteAction(request, false)).toEqual({
      ok: true,
      voted: false,
      votes: 1,
    });
  });

  // V4 through the real action: the double-click sends "yes" twice.
  it("voting twice in a row leaves one vote", async () => {
    await signInAs();
    const request = await createRequest();

    const [first, second] = await Promise.all([
      setVoteAction(request, true),
      setVoteAction(request, true),
    ]);

    expect(first).toMatchObject({ ok: true, voted: true });
    expect(second).toMatchObject({ ok: true, voted: true });
    expect(await voteCount(request)).toBe(2);
  });

  // ── Refusals. Each must change nothing and use no quota (V9: the rate
  //    limit is the last check). ─────────────────────────────────────────────

  // V3: THE security test, and what the M6 walkthrough does by hand.
  it("refuses a visitor", async () => {
    const request = await createRequest();

    expect(await setVoteAction(request, true)).toEqual({
      ok: false,
      message: VOTE_MESSAGES.signIn,
    });
    expect(await voteCount(request)).toBe(1);
    expect(await quotaUsed()).toBe(0);
  });

  // Finding 6 from /code-review, Jonathan's fix: the visitor check comes
  // before the request lookup. A signed-out POST is told to sign in,
  // whatever id it sends, without a database query. Before, an existing id
  // said "sign in" and a missing one said "doesn't exist".
  it.each([
    ["an id that doesn't exist", 12345],
    ["text", "abc"],
  ])("tells a visitor to sign in, even for %s", async (_name, requestId) => {
    expect(await setVoteAction(requestId, true)).toEqual({
      ok: false,
      message: VOTE_MESSAGES.signIn,
    });
  });

  // Decision B, on the server: the button is disabled for the demo, but a
  // hand-made POST from a demo session must be refused too.
  it("refuses the demo account", async () => {
    await signInAs({ isDemo: true });
    const request = await createRequest();

    expect(await setVoteAction(request, true)).toEqual({
      ok: false,
      message: VOTE_MESSAGES.notAllowed,
    });
    expect(await voteCount(request)).toBe(1);
    expect(await quotaUsed()).toBe(0);
  });

  // Decision A, on the server: votes on decided requests are frozen, in
  // both directions.
  it.each(["shipped", "declined"] as const)(
    "refuses votes on a %s request, and taking one back",
    async (status) => {
      const user = await signInAs();
      const request = await createRequest("open");
      await setVoteAction(request, true);
      await db.execute(
        sql`update feature_request set status = ${status} where id = ${request}`,
      );

      for (const voted of [true, false]) {
        expect(await setVoteAction(request, voted)).toEqual({
          ok: false,
          message: VOTE_MESSAGES.notAllowed,
        });
      }
      // The vote cast while it was open is still there: frozen, not erased.
      const { rows } = await db.execute<{ n: number }>(
        sql`select count(*)::int as n from vote
            where request_id = ${request} and user_id = ${user.id}`,
      );
      expect(rows[0].n).toBe(1);
    },
  );

  // V8: whatever a hand-made POST sends as the id, the answer is "not
  // found", never a database error.
  it.each([
    ["an id that doesn't exist", 12345],
    ["text", "abc"],
    ["too big for Postgres integer", 99999999999],
    ["nothing", undefined],
    ["an object", { id: 1 }],
  ])("refuses %s as the request id", async (_name, requestId) => {
    await signInAs();

    expect(await setVoteAction(requestId, true)).toEqual({
      ok: false,
      message: VOTE_MESSAGES.notFound,
    });
    expect(await quotaUsed()).toBe(0);
  });

  // Step 3: only a real true or false. "true" and 1 look harmless, but
  // accepting them means guessing what a caller meant.
  it.each([
    ["the text 'true'", "true"],
    ["the number 1", 1],
    ["nothing", undefined],
  ])("refuses %s as the vote", async (_name, voted) => {
    await signInAs();
    const request = await createRequest();

    expect(await setVoteAction(request, voted)).toEqual({
      ok: false,
      message: VOTE_MESSAGES.invalid,
    });
    expect(await voteCount(request)).toBe(1);
    expect(await quotaUsed()).toBe(0);
  });

  // V7: 60 changes a minute. Votes and un-votes both count.
  it("refuses the 61st vote change in a minute, and changes nothing", async () => {
    await signInAs();
    const request = await createRequest();
    for (let i = 0; i < 60; i++) {
      expect(await setVoteAction(request, i % 2 === 0)).toMatchObject({
        ok: true,
      });
    }
    // 60 changes, ending on "no" (the last i was 59): back to 1 vote.
    expect(await voteCount(request)).toBe(1);

    expect(await setVoteAction(request, true)).toEqual({
      ok: false,
      message: expect.stringMatching(/Try again in 1 minute\.$/),
    });
    expect(await voteCount(request)).toBe(1);
  });
});
