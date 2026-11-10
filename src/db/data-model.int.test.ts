// Tests for the data model rules (D1 to D8) in docs/specs/m4-data-model.md.
// Written before the schema: they fail until Jonathan's design exists.
//
// Raw SQL on purpose: the tests only depend on the table and column names in
// the spec, not on how the Drizzle schema is written. Each test starts with an
// empty database (the integration setup wipes every table first).
import { sql, type SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Postgres explains every rejection with a 5-character code. Checking the code
// proves the right rule said no (not, say, a typo in a column name).
const CODES = {
  NOT_NULL: "23502", // a required value was missing
  FOREIGN_KEY: "23503", // pointed at a row that doesn't exist
  UNIQUE: "23505", // a duplicate of something that must be unique
  CHECK: "23514", // a CHECK constraint said no
  ENUM: "22P02", // a value isn't in the enum type
  TOO_LONG: "22001", // longer than a varchar(n) allows
} as const;

async function errorCode(statement: SQL) {
  try {
    await db.execute(statement);
    return null;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.code ?? e.cause?.code ?? "unknown";
  }
}

let counter = 0;
async function createUser(name = "Test User") {
  counter += 1;
  const id = `user-${counter}`;
  await db.execute(
    sql`insert into "user" (id, name, email)
        values (${id}, ${name}, ${`${id}@example.com`})`,
  );
  return id;
}

// Returns the new request's id, whatever its type (decision A).
async function createRequest(
  authorId: string,
  { title = "Dark mode", description = "Please add a dark theme." } = {},
) {
  const { rows } = await db.execute<{ id: string | number }>(
    sql`insert into feature_request (title, description, author_id)
        values (${title}, ${description}, ${authorId})
        returning id`,
  );
  return rows[0].id;
}

function addVote(userId: string, requestId: string | number) {
  return sql`insert into vote (user_id, request_id)
             values (${userId}, ${requestId})`;
}

function addComment(
  requestId: string | number,
  authorId: string,
  body = "Yes please!",
) {
  return sql`insert into comment (request_id, author_id, body)
             values (${requestId}, ${authorId}, ${body})`;
}

async function count(statement: SQL) {
  const { rows } = await db.execute<{ n: string }>(statement);
  return Number(rows[0].n);
}

// ---------------------------------------------------------------------------
// D1 + D2: requests and their status
// ---------------------------------------------------------------------------

describe("feature_request", () => {
  it("starts as 'open', with a creation time, when only the required fields are given", async () => {
    const author = await createUser();
    const id = await createRequest(author);

    const { rows } = await db.execute<{ status: string; recent: boolean }>(
      sql`select status, created_at > now() - interval '1 minute' as recent
          from feature_request where id = ${id}`,
    );

    expect(rows[0]).toEqual({ status: "open", recent: true });
  });

  it.each(["open", "planned", "in_progress", "shipped", "declined"])(
    "accepts the status '%s'",
    async (status) => {
      const author = await createUser();
      const id = await createRequest(author);

      const code = await errorCode(
        sql`update feature_request set status = ${status} where id = ${id}`,
      );

      expect(code).toBeNull();
    },
  );

  // Near-misses are the realistic bugs: a space instead of an underscore,
  // the wrong case, a status that was never in the product.
  it.each(["in progress", "OPEN", "archived", ""])(
    "rejects the status '%s'",
    async (status) => {
      const author = await createUser();
      const id = await createRequest(author);

      const code = await errorCode(
        sql`update feature_request set status = ${status} where id = ${id}`,
      );

      expect([CODES.CHECK, CODES.ENUM]).toContain(code);
    },
  );

  it.each(["title", "description", "status", "author_id", "created_at"])(
    "never allows %s to be null",
    async (column) => {
      const author = await createUser();
      const id = await createRequest(author);

      const code = await errorCode(
        sql`update feature_request set ${sql.identifier(column)} = null
            where id = ${id}`,
      );

      expect(code).toBe(CODES.NOT_NULL);
    },
  );

  // D4: a request by someone who doesn't exist would break every page that
  // shows the author.
  it("must be written by a user who exists", async () => {
    const code = await errorCode(
      sql`insert into feature_request (title, description, author_id)
          values ('Ghost', 'From nobody', 'no-such-user')`,
    );

    expect(code).toBe(CODES.FOREIGN_KEY);
  });
});

// ---------------------------------------------------------------------------
// D3: visible content and maximum lengths
// ---------------------------------------------------------------------------

// Each limit is tested on both sides: exactly at the limit is accepted, one
// over is rejected. That proves where the line is, not just that "long" fails.
describe("text limits", () => {
  // A CHECK constraint or a varchar(n) column can both enforce a maximum.
  const LENGTH_REJECTED = [CODES.CHECK, CODES.TOO_LONG];

  describe.each([
    { field: "title", max: 120 },
    { field: "description", max: 5000 },
  ])("request $field", ({ field, max }) => {
    async function setField(value: string) {
      const author = await createUser();
      const id = await createRequest(author);
      return errorCode(
        sql`update feature_request set ${sql.identifier(field)} = ${value}
            where id = ${id}`,
      );
    }

    it(`accepts exactly ${max} characters`, async () => {
      expect(await setField("a".repeat(max))).toBeNull();
    });

    it(`rejects ${max + 1} characters`, async () => {
      expect(LENGTH_REJECTED).toContain(await setField("a".repeat(max + 1)));
    });

    it("rejects an empty value", async () => {
      expect(await setField("")).toBe(CODES.CHECK);
    });

    it("rejects a value that's only spaces", async () => {
      expect(await setField("     ")).toBe(CODES.CHECK);
    });

    it("accepts a single visible character", async () => {
      expect(await setField("x")).toBeNull();
    });
  });

  describe("comment body", () => {
    async function comment(body: string) {
      const author = await createUser();
      const request = await createRequest(author);
      return errorCode(addComment(request, author, body));
    }

    it("accepts exactly 2000 characters", async () => {
      expect(await comment("a".repeat(2000))).toBeNull();
    });

    it("rejects 2001 characters", async () => {
      expect(LENGTH_REJECTED).toContain(await comment("a".repeat(2001)));
    });

    it("rejects an empty or all-spaces body", async () => {
      expect(await comment("")).toBe(CODES.CHECK);
      expect(await comment("   ")).toBe(CODES.CHECK);
    });
  });
});

// ---------------------------------------------------------------------------
// D4 + D5: votes
// ---------------------------------------------------------------------------

describe("vote", () => {
  // The rule behind "safe against double-clicks" in M6: even if two clicks
  // race past the app's checks, the database keeps one vote.
  it("allows only one vote per user per request", async () => {
    const voter = await createUser();
    const request = await createRequest(voter);
    await db.execute(addVote(voter, request));

    expect(await errorCode(addVote(voter, request))).toBe(CODES.UNIQUE);
  });

  // The control cases: uniqueness is per (user, request) pair, not per user
  // or per request. Without these, "no one can ever vote twice on anything"
  // would also pass the test above.
  it("lets one user vote on different requests, and many users on one request", async () => {
    const ada = await createUser("Ada");
    const grace = await createUser("Grace");
    const first = await createRequest(ada);
    const second = await createRequest(ada);

    expect(await errorCode(addVote(ada, first))).toBeNull();
    expect(await errorCode(addVote(ada, second))).toBeNull();
    expect(await errorCode(addVote(grace, first))).toBeNull();
  });

  it("must be by a user who exists, on a request that exists", async () => {
    const voter = await createUser();
    const request = await createRequest(voter);

    expect(await errorCode(addVote("no-such-user", request))).toBe(
      CODES.FOREIGN_KEY,
    );
    // An id that can't exist, whatever the id type (decision A).
    await db.execute(sql`delete from feature_request where id = ${request}`);
    expect(await errorCode(addVote(voter, request))).toBe(CODES.FOREIGN_KEY);
  });

  it("records when the vote was cast", async () => {
    const voter = await createUser();
    const request = await createRequest(voter);
    await db.execute(addVote(voter, request));

    expect(
      await count(
        sql`select count(*) as n from vote
            where created_at > now() - interval '1 minute'`,
      ),
    ).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// D4: comments
// ---------------------------------------------------------------------------

describe("comment", () => {
  it("must be on a request that exists, by a user who exists", async () => {
    const author = await createUser();
    const request = await createRequest(author);

    expect(await errorCode(addComment(request, "no-such-user"))).toBe(
      CODES.FOREIGN_KEY,
    );
    await db.execute(sql`delete from feature_request where id = ${request}`);
    expect(await errorCode(addComment(request, author))).toBe(
      CODES.FOREIGN_KEY,
    );
  });

  it("never allows request_id, author_id, body or created_at to be null", async () => {
    const author = await createUser();
    const request = await createRequest(author);
    await db.execute(addComment(request, author));

    for (const column of ["request_id", "author_id", "body", "created_at"]) {
      expect(
        await errorCode(
          sql`update comment set ${sql.identifier(column)} = null`,
        ),
        column,
      ).toBe(CODES.NOT_NULL);
    }
  });
});

// ---------------------------------------------------------------------------
// D6 + D7: what deleting does
// ---------------------------------------------------------------------------

describe("deleting", () => {
  // M8: an admin deletes a spam request. Its votes and comments must go too,
  // or they'd point at nothing, and the delete would fail or leave junk.
  it("deleting a request deletes its votes and comments, and nothing else", async () => {
    const ada = await createUser("Ada");
    const grace = await createUser("Grace");
    const spam = await createRequest(ada, { title: "Buy now" });
    const real = await createRequest(ada, { title: "Dark mode" });
    for (const request of [spam, real]) {
      await db.execute(addVote(grace, request));
      await db.execute(addComment(request, grace));
    }

    await db.execute(sql`delete from feature_request where id = ${spam}`);

    expect(
      await count(
        sql`select count(*) as n from vote where request_id = ${spam}`,
      ),
    ).toBe(0);
    expect(
      await count(
        sql`select count(*) as n from comment where request_id = ${spam}`,
      ),
    ).toBe(0);
    // The other request is untouched.
    expect(
      await count(
        sql`select count(*) as n from vote where request_id = ${real}`,
      ),
    ).toBe(1);
    expect(
      await count(
        sql`select count(*) as n from comment where request_id = ${real}`,
      ),
    ).toBe(1);
  });

  // A deleted person's vote shouldn't keep counting. (What happens to their
  // requests and comments is decision C; those tests come once it's made.)
  it("deleting a user deletes their votes", async () => {
    const author = await createUser("Author");
    const voter = await createUser("Voter");
    const request = await createRequest(author);
    await db.execute(addVote(author, request));
    await db.execute(addVote(voter, request));

    await db.execute(sql`delete from "user" where id = ${voter}`);

    expect(
      await count(
        sql`select count(*) as n from vote where request_id = ${request}`,
      ),
    ).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// D8: timestamps
// ---------------------------------------------------------------------------

describe("timestamps", () => {
  // timestamptz stores an exact moment, so every computer reads it the same
  // way. Plain `timestamp` is what caused M3 step 7's 6-hour test failure.
  it("are timestamptz, never null, and default to now in every new table", async () => {
    const { rows } = await db.execute<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      sql`select table_name, column_name, data_type, is_nullable, column_default
          from information_schema.columns
          where table_schema = 'public'
            and table_name in ('feature_request', 'vote', 'comment')
            and data_type like 'timestamp%'
          order by table_name, column_name`,
    );

    // Every table in the spec has created_at, so there must be at least 3.
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const row of rows) {
      const where = `${row.table_name}.${row.column_name}`;
      expect(row.data_type, where).toBe("timestamp with time zone");
      expect(row.is_nullable, where).toBe("NO");
      expect(row.column_default, where).toMatch(/now\(\)|CURRENT_TIMESTAMP/i);
    }
  });
});
