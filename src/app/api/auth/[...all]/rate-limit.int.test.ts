// Tests for the sign-up rate limit: 5 per hour per IP, counted in Postgres.
// Config: `rateLimit` in src/lib/auth-options.ts. Rule: docs/PLAN.md.
//
// These call the real route handler, so they run Better Auth's actual limiter
// against the test database. Each test starts with an empty database (and so
// with no counts), because the integration setup wipes every table first.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";

import { POST } from "./route";

// Better Auth identifies the visitor by this header. On Vercel, Vercel sets it
// and a visitor can't fake it; here, tests set it to act as different people.
function signUpFrom(ip: string, email: string) {
  return POST(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({
        email,
        password: "correct-horse-battery-staple",
        name: "Test User",
      }),
    }),
  );
}

// Signs up `count` different accounts from one IP and returns the statuses.
// Sequential on purpose: the order of requests is what's being tested.
async function signUpManyFrom(ip: string, count: number) {
  const statuses: number[] = [];
  for (let i = 1; i <= count; i++) {
    const response = await signUpFrom(ip, `user${i}-${ip}@example.com`);
    statuses.push(response.status);
  }
  return statuses;
}

const LIMIT = 5;

describe("sign-up rate limit", () => {
  it("allows 5 sign-ups from one IP, then refuses the 6th", async () => {
    const ip = "203.0.113.10";
    expect(await signUpManyFrom(ip, LIMIT)).toEqual([200, 200, 200, 200, 200]);

    const blocked = await signUpFrom(ip, "one-too-many@example.com");

    // 429 is HTTP's "Too Many Requests". The header tells the client how many
    // seconds to wait; it should be close to an hour.
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("x-retry-after"))).toBeGreaterThan(
      60 * 59,
    );
    // Refused before Better Auth even looked at the body, so no account.
    const { rows } = await db.execute(
      sql`select 1 from "user" where email = 'one-too-many@example.com'`,
    );
    expect(rows).toHaveLength(0);
  });

  // Counted per IP: one busy visitor mustn't lock everyone else out.
  it("counts each IP separately", async () => {
    await signUpManyFrom("203.0.113.20", LIMIT);
    expect(
      (await signUpFrom("203.0.113.20", "blocked@example.com")).status,
    ).toBe(429);

    const otherVisitor = await signUpFrom("203.0.113.21", "fine@example.com");

    expect(otherVisitor.status).toBe(200);
  });

  // The whole reason for database storage: on Vercel, the next request may
  // land on a different server. A count in one server's memory would be
  // invisible to the others; a row in Postgres is shared by all of them.
  it("keeps the count in the database, where every server sees it", async () => {
    await signUpManyFrom("203.0.113.30", 3);

    const { rows } = await db.execute<{ key: string; count: number }>(
      sql`select key, count from rate_limit`,
    );

    expect(rows).toContainEqual({
      key: "203.0.113.30|/sign-up/email",
      count: 3,
    });
  });

  // We can't wait an hour in a test, so move the last request an hour into
  // the past instead. This is what the database would look like an hour later.
  it("allows sign-ups again after an hour without any", async () => {
    const ip = "203.0.113.40";
    await signUpManyFrom(ip, LIMIT);
    expect((await signUpFrom(ip, "too-soon@example.com")).status).toBe(429);

    const oneHourAndASecondAgo = Date.now() - (60 * 60 + 1) * 1000;
    await db.execute(
      sql`update rate_limit set last_request = ${oneHourAndASecondAgo}
          where key = ${`${ip}|/sign-up/email`}`,
    );

    expect((await signUpFrom(ip, "later@example.com")).status).toBe(200);
  });
});
