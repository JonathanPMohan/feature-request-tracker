// Integration tests for the request queries (spec S2 to S5, S10), against the
// real tables. data-model.int.test.ts proved the M4 reference query in raw
// SQL; these prove the Drizzle version the pages use behaves the same.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";

import {
  createRequestWithVote,
  findRequest,
  getRequest,
  listRequests,
  PAGE_SIZE,
  parseRequestId,
  parseStatusFilter,
  STATUSES,
  type Status,
} from "./requests";

let counter = 0;
async function createUser(name = "Test User") {
  counter += 1;
  const id = `req-user-${counter}`;
  await db.execute(
    sql`insert into "user" (id, name, email)
        values (${id}, ${name}, ${`${id}@example.com`})`,
  );
  return id;
}

// A request with a chosen status, time and number of extra voters.
async function seedRequest(
  authorId: string,
  {
    title = "Dark mode",
    status = "open" as Status,
    createdAt = "2026-01-01Z",
    extraVotes = 0,
  } = {},
) {
  const id = await createRequestWithVote({
    title,
    description: "Details",
    authorId,
  });
  await db.execute(
    sql`update feature_request set status = ${status}, created_at = ${createdAt}
        where id = ${id}`,
  );
  for (let i = 0; i < extraVotes; i++) {
    const voter = await createUser();
    await db.execute(
      sql`insert into vote (user_id, request_id) values (${voter}, ${id})`,
    );
  }
  return id;
}

const titles = (result: Awaited<ReturnType<typeof listRequests>>) =>
  result.requests.map((r) => r.title);

describe("createRequestWithVote", () => {
  // PLAN.md: "new requests start at 1".
  it("saves the request with its author's vote", async () => {
    const author = await createUser("Ada");
    const id = await createRequestWithVote({
      title: "Dark mode",
      description: "Please.",
      authorId: author,
    });

    expect(await getRequest(id)).toMatchObject({
      title: "Dark mode",
      description: "Please.",
      status: "open",
      authorName: "Ada",
      votes: 1,
    });
  });

  // S10, the reason for the transaction. To make the SECOND insert fail on
  // purpose, the test briefly adds a rule to the vote table that refuses
  // every row. The first insert (the request) succeeds; the vote fails; the
  // transaction must undo the request too.
  //
  // NOT VALID skips checking existing rows, so adding the rule is instant.
  // It's always removed in `finally`, even if the test fails.
  it("saves nothing when the vote can't be saved", async () => {
    const author = await createUser();
    await db.execute(
      sql`alter table vote add constraint test_refuse_all check (false) not valid`,
    );
    try {
      await expect(
        createRequestWithVote({
          title: "Dark mode",
          description: "Please.",
          authorId: author,
        }),
      ).rejects.toThrow();
    } finally {
      await db.execute(sql`alter table vote drop constraint test_refuse_all`);
    }

    const { rows } = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from feature_request`,
    );
    expect(rows[0].n).toBe(0);
  });
});

describe("listRequests", () => {
  it("sorts by votes, then newest, and counts the author's vote", async () => {
    const author = await createUser();
    await seedRequest(author, { title: "Old, popular", extraVotes: 2 });
    await seedRequest(author, {
      title: "Older, 1 vote",
      createdAt: "2026-02-01Z",
    });
    await seedRequest(author, {
      title: "Newer, 1 vote",
      createdAt: "2026-03-01Z",
    });

    const result = await listRequests({ filter: "all", page: 1 });

    expect(titles(result)).toEqual([
      "Old, popular",
      "Newer, 1 vote",
      "Older, 1 vote",
    ]);
    expect(result.requests.map((r) => r.votes)).toEqual([3, 1, 1]);
  });

  // count(vote.user_id), not count(*) (M4). In M6 an author can take back
  // their own vote, leaving a request with none: it must count as 0, and
  // still be listed.
  it("lists a request with no votes as 0", async () => {
    const author = await createUser();
    const id = await seedRequest(author);
    await db.execute(sql`delete from vote where request_id = ${id}`);

    const result = await listRequests({ filter: "all", page: 1 });
    expect(result.requests).toMatchObject([{ id, votes: 0 }]);
  });

  describe("status filter (S4, decision A)", () => {
    async function oneOfEach() {
      const author = await createUser();
      for (const status of [
        "open",
        "planned",
        "in_progress",
        "shipped",
        "declined",
      ] as const) {
        await seedRequest(author, { title: status, status });
      }
    }

    it("shows only active requests by default", async () => {
      await oneOfEach();
      const result = await listRequests({ filter: "active", page: 1 });
      expect(titles(result).sort()).toEqual(["in_progress", "open", "planned"]);
    });

    it("shows one status when asked", async () => {
      await oneOfEach();
      const result = await listRequests({ filter: "shipped", page: 1 });
      expect(titles(result)).toEqual(["shipped"]);
    });

    it("shows every status for 'all'", async () => {
      await oneOfEach();
      const result = await listRequests({ filter: "all", page: 1 });
      expect(result.requests).toHaveLength(5);
    });
  });

  describe("pages (S3)", () => {
    // 45 requests: two full pages and a page of 5. Same votes and the same
    // time for all, so only the id keeps the order stable.
    async function seed45() {
      const author = await createUser();
      for (let i = 0; i < 45; i++) {
        await seedRequest(author, { title: `Request ${i}` });
      }
    }

    it("returns 20 per page, every request exactly once", async () => {
      await seed45();
      const pages = await Promise.all(
        [1, 2, 3].map((page) => listRequests({ filter: "all", page })),
      );

      expect(pages.map((p) => p.requests.length)).toEqual([
        PAGE_SIZE,
        PAGE_SIZE,
        5,
      ]);
      const ids = pages.flatMap((p) => p.requests.map((r) => r.id));
      expect(new Set(ids).size).toBe(45);
    });

    it("reports the number of pages, counting only the filtered requests", async () => {
      await seed45();
      const author = await createUser();
      await seedRequest(author, { status: "shipped" });

      expect(
        (await listRequests({ filter: "active", page: 1 })).totalPages,
      ).toBe(3);
      expect(
        (await listRequests({ filter: "shipped", page: 1 })).totalPages,
      ).toBe(1);
    });

    // An empty board still has page 1, so "page 1 of 0" never appears.
    it("has 1 page when there are no requests", async () => {
      expect(await listRequests({ filter: "active", page: 1 })).toEqual({
        requests: [],
        totalPages: 1,
      });
    });

    it("returns no requests for a page past the end", async () => {
      await seed45();
      expect(
        (await listRequests({ filter: "all", page: 99 })).requests,
      ).toEqual([]);
    });
  });
});

describe("getRequest", () => {
  it("returns null for an id that doesn't exist", async () => {
    expect(await getRequest(12345)).toBeNull();
  });

  // S6: the author's name, never their email.
  it("includes the author's name but not their email", async () => {
    const author = await createUser("Grace");
    const id = await seedRequest(author);

    const request = await getRequest(id);
    expect(request?.authorName).toBe("Grace");
    expect(JSON.stringify(request)).not.toContain("@example.com");
  });
});

describe("parseStatusFilter", () => {
  it.each([
    [undefined, "active"],
    ["all", "all"],
    ["shipped", "shipped"],
    ["in_progress", "in_progress"],
    // Unknown values fall back to the default instead of erroring.
    ["SHIPPED", "active"],
    ["nonsense", "active"],
    ["", "active"],
    [["planned", "shipped"], "planned"],
  ])("%j → %s", (value, expected) => {
    expect(parseStatusFilter(value)).toBe(expected);
  });
});

describe("parseRequestId", () => {
  it.each([
    ["1", 1],
    ["42", 42],
    ["2147483647", 2147483647], // the largest Postgres integer
  ])("accepts %s", (value, expected) => {
    expect(parseRequestId(value)).toBe(expected);
  });

  // Each of these must become a 404, never a database error.
  it.each([
    "0",
    "-1",
    "abc",
    "1.5",
    "1e3",
    " 1",
    "",
    "2147483648", // one past the largest integer: Postgres error 22003
    "99999999999",
  ])("refuses %j", (value) => {
    expect(parseRequestId(value)).toBeNull();
  });

  // Proves why the upper bound exists: the database itself refuses it.
  it("matches what Postgres can store", async () => {
    await expect(getRequest(2147483648)).rejects.toThrow();
  });
});

// STATUSES in requests.ts repeats the list in Jonathan's database CHECK
// (feature_request_status_valid). If M8 adds a status to the CHECK but not
// here, the app would mislabel it. This reads the CHECK from the database
// and compares. (Found by /code-review.)
describe("STATUSES", () => {
  it("matches the statuses the database allows", async () => {
    const { rows } = await db.execute<{ definition: string }>(
      sql`select pg_get_constraintdef(oid) as definition
          from pg_constraint where conname = 'feature_request_status_valid'`,
    );
    // The definition reads like: CHECK ((status = ANY (ARRAY['open'::text, ...
    const inCheck = [...rows[0].definition.matchAll(/'([a-z_]+)'/g)].map(
      (match) => match[1],
    );

    expect([...inCheck].sort()).toEqual([...STATUSES].sort());
  });
});

// M6, V2: the button shows whether *you* voted. The query answers it per
// request, for whoever is viewing.
describe("votedByViewer", () => {
  it("is true only for requests the viewer voted for", async () => {
    const author = await createUser();
    const viewer = await createUser();
    const liked = await seedRequest(author, { title: "Liked" });
    await seedRequest(author, { title: "Not liked" });
    await db.execute(
      sql`insert into vote (user_id, request_id) values (${viewer}, ${liked})`,
    );

    const { requests } = await listRequests({
      filter: "all",
      page: 1,
      viewerId: viewer,
    });

    expect(
      Object.fromEntries(requests.map((r) => [r.title, r.votedByViewer])),
    ).toEqual({ Liked: true, "Not liked": false });
  });

  // The author's own first vote counts as theirs (M5: submitting votes).
  it("is true for the author of a new request", async () => {
    const author = await createUser();
    const id = await seedRequest(author);

    expect((await getRequest(id, author))?.votedByViewer).toBe(true);
  });

  // Control cases: a visitor has never voted, and a request with no votes
  // at all says false, not null (the coalesce in votedBy).
  it("is false for a visitor, and for a request with no votes", async () => {
    const author = await createUser();
    const id = await seedRequest(author);

    expect((await getRequest(id))?.votedByViewer).toBe(false);

    await db.execute(sql`delete from vote where request_id = ${id}`);
    expect((await getRequest(id, author))?.votedByViewer).toBe(false);
  });
});

// The lookup the vote and comment actions share (moved here from
// votes.int.test.ts when getVoteTarget became findRequest, in M7).
describe("findRequest", () => {
  it("returns the request's id and status", async () => {
    const request = await seedRequest(await createUser());
    await db.execute(
      sql`update feature_request set status = 'planned' where id = ${request}`,
    );

    expect(await findRequest(request)).toEqual({
      id: request,
      status: "planned",
    });
    // A string works too: form data arrives as text.
    expect(await findRequest(String(request))).toEqual({
      id: request,
      status: "planned",
    });
  });

  // V8: anything a hand-made POST could send is "no such request", never a
  // database error.
  it.each([
    ["an id that doesn't exist", 12345],
    ["zero", 0],
    ["a negative number", -1],
    ["a fraction", 1.5],
    ["too big for Postgres integer", 2147483648],
    ["text", "abc"],
    ["null", null],
    ["an object", { id: 1 }],
    ["an array", [1]],
  ])("returns null for %s", async (_name, value) => {
    expect(await findRequest(value)).toBeNull();
  });
});
