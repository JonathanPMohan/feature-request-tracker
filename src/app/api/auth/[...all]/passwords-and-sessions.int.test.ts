// Tests that passwords are stored safely and sessions end when they should.
// They go through the real auth route and inspect the test database directly,
// because "is the password hashed?" can only be answered by looking at what
// was actually stored.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";

import { GET, POST } from "./route";

const PASSWORD = "correct-horse-battery-staple";
const DAY_MS = 24 * 60 * 60 * 1000;

function authRequest(
  path: string,
  {
    method = "POST",
    body,
    cookie,
  }: {
    method?: string;
    body?: unknown;
    cookie?: string;
  } = {},
) {
  const handler = method === "GET" ? GET : POST;
  return handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

// "name=value; HttpOnly; ..." → "name=value", the part a browser sends back.
function cookieFrom(response: Response) {
  return response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function signUp(email: string) {
  const response = await authRequest("/sign-up/email", {
    body: { email, password: PASSWORD, name: "Test User" },
  });
  expect(response.status).toBe(200);
  return response;
}

// Who does this cookie belong to? null means "not signed in".
async function sessionEmail(cookie: string): Promise<string | null> {
  const response = await authRequest("/get-session", { method: "GET", cookie });
  const body = (await response.json()) as { user?: { email: string } } | null;
  return body?.user?.email ?? null;
}

async function storedPasswordOf(email: string) {
  const { rows } = await db.execute<{ password: string }>(
    sql`select a.password from account a
        join "user" u on u.id = a.user_id
        where u.email = ${email}`,
  );
  return rows[0].password;
}

// TIME ZONES
// Better Auth's `expires_at` is a `timestamp` column, which has no time zone.
// Drizzle (and so Better Auth) always writes and reads it as UTC. The raw `pg`
// driver would instead read it as this computer's local time: hours off on a
// laptop outside UTC, but correct in CI, which runs in UTC. So both helpers
// state "this is UTC" in the SQL itself.

// Each session's expiry, in milliseconds since 1970 (what Date.now() returns).
async function sessionExpiry(email: string) {
  const { rows } = await db.execute<{ ms: string }>(
    sql`select extract(epoch from s.expires_at at time zone 'UTC') * 1000 as ms
        from session s
        join "user" u on u.id = s.user_id
        where u.email = ${email}`,
  );
  return rows.map((r) => Number(r.ms));
}

async function setSessionExpiry(email: string, expiresAt: Date) {
  await db.execute(
    sql`update session
        set expires_at = ${expiresAt.toISOString()}::timestamptz at time zone 'UTC'
        where user_id = (select id from "user" where email = ${email})`,
  );
}

describe("passwords", () => {
  // If the database leaked, the attacker must not be able to read passwords.
  it("stores a salted scrypt hash, never the password itself", async () => {
    await signUp("ada@example.com");

    const stored = await storedPasswordOf("ada@example.com");

    expect(stored).not.toContain(PASSWORD);
    // Better Auth's format: a random 16-byte salt and a 64-byte scrypt
    // result, both as hex, joined by a colon.
    expect(stored).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
  });

  // The salt is what makes this true. Without it, everyone with the same
  // password would share a hash, and cracking one would crack them all
  // (and precomputed "rainbow tables" would work).
  it("gives two people with the same password different hashes", async () => {
    await signUp("ada@example.com");
    await signUp("grace@example.com");

    expect(await storedPasswordOf("ada@example.com")).not.toBe(
      await storedPasswordOf("grace@example.com"),
    );
  });

  it("keeps the password and its hash out of the user table and API responses", async () => {
    const response = await signUp("ada@example.com");
    const stored = await storedPasswordOf("ada@example.com");

    const responseText = await response.text();
    expect(responseText).not.toContain(PASSWORD);
    expect(responseText).not.toContain(stored);

    // The hash lives only in `account`. `user` has no password column at all.
    const { rows } = await db.execute(
      sql`select column_name from information_schema.columns
          where table_name = 'user' and column_name ilike '%password%'`,
    );
    expect(rows).toHaveLength(0);
  });
});

describe("sessions", () => {
  // JavaScript in the page can't read an HttpOnly cookie, so an XSS bug can't
  // steal the session. SameSite=Lax stops other sites sending it along with
  // their own form posts (cross-site request forgery).
  it("sets the session cookie HttpOnly and SameSite=Lax", async () => {
    const response = await signUp("ada@example.com");

    const sessionCookie = response.headers
      .getSetCookie()
      .find((c) => c.includes("session_token"));

    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/;\s*HttpOnly/i);
    expect(sessionCookie).toMatch(/;\s*SameSite=Lax/i);
  });

  it("lasts 7 days from sign-in", async () => {
    const before = Date.now();
    await signUp("ada@example.com");

    const [expiresAt] = await sessionExpiry("ada@example.com");

    // Within a minute of exactly 7 days, to allow for the test's own runtime.
    expect(Math.abs(expiresAt - (before + 7 * DAY_MS))).toBeLessThan(60_000);
  });

  // We can't wait a week in a test, so move the expiry into the past: this is
  // what the database looks like once the week is up.
  it("stops working once it expires", async () => {
    const cookie = cookieFrom(await signUp("ada@example.com"));
    expect(await sessionEmail(cookie)).toBe("ada@example.com");

    await setSessionExpiry("ada@example.com", new Date(Date.now() - 1000));

    expect(await sessionEmail(cookie)).toBeNull();
  });

  // The "sliding" part: a session in regular use doesn't expire mid-week.
  // Here the session is 2 days old (5 days left); using it resets it to 7.
  it("extends a session more than a day old when it's used", async () => {
    const cookie = cookieFrom(await signUp("ada@example.com"));
    await setSessionExpiry(
      "ada@example.com",
      new Date(Date.now() + 5 * DAY_MS),
    );

    expect(await sessionEmail(cookie)).toBe("ada@example.com");

    const [expiresAt] = await sessionExpiry("ada@example.com");
    expect(expiresAt).toBeGreaterThan(Date.now() + 6.9 * DAY_MS);
  });

  // Signing out must end the session on the server, not just delete the
  // browser's cookie. Otherwise a copied cookie would keep working.
  it("signing out deletes the session, so a copied cookie stops working", async () => {
    const cookie = cookieFrom(await signUp("ada@example.com"));
    const copiedCookie = cookie;

    const signOut = await authRequest("/sign-out", { body: {}, cookie });
    expect(signOut.status).toBe(200);

    expect(await sessionExpiry("ada@example.com")).toEqual([]);
    expect(await sessionEmail(copiedCookie)).toBeNull();
  });
});
