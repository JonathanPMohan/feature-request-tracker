// Integration tests for voting in the database (spec V4, V8). The point is
// that "set my vote" is safe to repeat, and safe when many arrive at once.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";

import { createRequestWithVote } from "./requests";
import { setVote } from "./votes";

let counter = 0;
async function createUser() {
  counter += 1;
  const id = `vote-user-${counter}`;
  await db.execute(
    sql`insert into "user" (id, name, email)
        values (${id}, 'Voter', ${`${id}@example.com`})`,
  );
  return id;
}

// A request by someone else, so it starts with exactly 1 vote (its author's).
async function createRequest() {
  const author = await createUser();
  return createRequestWithVote({
    title: "Dark mode",
    description: "Please.",
    authorId: author,
  });
}

async function voteRows(requestId: number, userId: string) {
  const { rows } = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from vote
        where request_id = ${requestId} and user_id = ${userId}`,
  );
  return rows[0].n;
}

describe("setVote", () => {
  it("adds a vote and returns the new count", async () => {
    const request = await createRequest();
    const user = await createUser();

    expect(await setVote(user, request, true)).toBe(2);
  });

  it("takes a vote back", async () => {
    const request = await createRequest();
    const user = await createUser();
    await setVote(user, request, true);

    expect(await setVote(user, request, false)).toBe(1);
  });

  // V4: the double-click. Two "yes" in a row is one vote, and no error from
  // the primary key.
  it("voting twice leaves one vote", async () => {
    const request = await createRequest();
    const user = await createUser();

    await setVote(user, request, true);
    expect(await setVote(user, request, true)).toBe(2);
    expect(await voteRows(request, user)).toBe(1);
  });

  it("taking back a vote twice is fine", async () => {
    const request = await createRequest();
    const user = await createUser();

    expect(await setVote(user, request, false)).toBe(1);
    expect(await setVote(user, request, false)).toBe(1);
  });

  // V1: authors can take back their own first vote, so a request can reach 0.
  it("lets the author take back their own vote", async () => {
    const author = await createUser();
    const request = await createRequestWithVote({
      title: "Dark mode",
      description: "Please.",
      authorId: author,
    });

    expect(await setVote(author, request, false)).toBe(0);
  });

  // V4 under pressure: 20 "yes" at the same moment, from one user. Each is
  // one statement and the primary key decides, so exactly one vote, and
  // none of the 20 fails.
  it("20 votes at the same moment leave one vote, without errors", async () => {
    const request = await createRequest();
    const user = await createUser();

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => setVote(user, request, true)),
    );

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await voteRows(request, user)).toBe(1);
  });

  // Yes and no racing each other (two tabs, a click and a quick un-click).
  // Whichever runs last wins; the result is 0 or 1 vote, never 2, never an
  // error.
  it("a mix of yes and no at the same moment ends with 0 or 1 vote", async () => {
    const request = await createRequest();
    const user = await createUser();

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) => setVote(user, request, i % 2 === 0)),
    );

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect([0, 1]).toContain(await voteRows(request, user));
  });

  // Control case: one user's vote doesn't touch anyone else's.
  it("only changes this user's vote", async () => {
    const request = await createRequest();
    const ada = await createUser();
    const grace = await createUser();
    await setVote(ada, request, true);
    await setVote(grace, request, true);

    expect(await setVote(ada, request, false)).toBe(2);
    expect(await voteRows(request, grace)).toBe(1);
  });
});
