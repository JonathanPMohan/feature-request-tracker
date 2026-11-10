// Tests for the role rules (R1–R6) in docs/specs/m3-roles-and-demo.md.
// The first examples were written before the implementation, as the spec in
// code; the rest were added alongside the design.
//
// They talk to the database with raw SQL (column name `role`, values 'user' and
// 'admin', as R1 specifies), so they don't depend on how the schema is written.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/auth/[...all]/route";
import { db } from "@/db";

// Signs up through the real HTTP route handler, exactly as a browser or an
// attacker's script would, including any extra fields in the body.
function signUp(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify(body),
    }),
  );
}

const newUser = (email: string) => ({
  email,
  password: "correct-horse-battery-staple",
  name: "Test User",
});

// Signs up and returns the session cookie, so a test can act as that user.
async function signUpAndGetCookie(email: string) {
  const response = await signUp(newUser(email));
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

// Calls Better Auth's "update my profile" endpoint as a signed-in user.
function updateUser(cookie: string, body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost:3000/api/auth/update-user", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        cookie,
      },
      body: JSON.stringify(body),
    }),
  );
}

async function roleOf(email: string): Promise<string | undefined> {
  const { rows } = await db.execute<{ role: string }>(
    sql`select role from "user" where email = ${email}`,
  );
  return rows[0]?.role;
}

// Postgres reports *why* a statement failed with a 5-character code. Checking
// the code (not just "it threw") makes sure the rule rejected it, rather than
// something unrelated such as a missing column.
async function postgresErrorCode(statement: Promise<unknown>) {
  try {
    await statement;
    return null;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.code ?? e.cause?.code ?? "unknown";
  }
}
const CHECK_VIOLATION = "23514"; // a CHECK constraint said no
const INVALID_ENUM_VALUE = "22P02"; // an enum type said no

describe("user roles", () => {
  // R1 + R2 (via sign-up)
  it("gives a new account the role 'user'", async () => {
    const response = await signUp(newUser("new@example.com"));

    expect(response.status).toBe(200);
    expect(await roleOf("new@example.com")).toBe("user");
  });

  // R2: a row created outside the app still gets the safe defaults
  it("gives a raw insert the role 'user' and is_demo false", async () => {
    await db.execute(
      sql`insert into "user" (id, name, email)
          values ('raw-1', 'Raw User', 'raw@example.com')`,
    );

    const { rows } = await db.execute<{ role: string; is_demo: boolean }>(
      sql`select role, is_demo from "user" where email = 'raw@example.com'`,
    );

    expect(rows[0].role).toBe("user");
    expect(rows[0].is_demo).toBe(false);
  });

  // R3: mass assignment. Better Auth either ignores the field (if it has a
  // default) or rejects the request (if not). Both are safe; what matters is
  // that no admin exists afterwards.
  it("cannot create an admin through sign-up, even if the request asks for it", async () => {
    const response = await signUp({
      ...newUser("attacker@example.com"),
      role: "admin",
    });

    expect([200, 400]).toContain(response.status);
    expect(await roleOf("attacker@example.com")).not.toBe("admin");
  });

  // R3: "update my profile" can't make someone an admin.
  //
  // update-user is turned off (disabledPaths in auth-options.ts), so the
  // request gets 404: there's no endpoint at all. `input: false` stays as a
  // second layer. If update-user is ever turned back on, change these to
  // expect 400, the status `input: false` gives.
  it("cannot become an admin through update-user", async () => {
    const cookie = await signUpAndGetCookie("updater@example.com");

    const response = await updateUser(cookie, { role: "admin" });

    expect(response.status).toBe(404);
    expect(await roleOf("updater@example.com")).toBe("user");
  });

  // R3: "update my profile" can't mark someone as the demo account
  it("cannot become the demo account through update-user", async () => {
    const cookie = await signUpAndGetCookie("demo-updater@example.com");

    const response = await updateUser(cookie, { isDemo: true });

    expect(response.status).toBe(404);

    const { rows } = await db.execute<{ is_demo: boolean }>(
      sql`select is_demo from "user" where email = 'demo-updater@example.com'`,
    );
    expect(rows[0].is_demo).toBe(false);
  });

  // R4: enforced by the database itself, so this bypasses the app entirely.
  it("rejects any role other than 'user' or 'admin' at the database level", async () => {
    await signUp(newUser("someone@example.com"));

    const code = await postgresErrorCode(
      db.execute(
        sql`update "user" set role = 'superadmin' where email = 'someone@example.com'`,
      ),
    );

    expect([CHECK_VIOLATION, INVALID_ENUM_VALUE]).toContain(code);
  });

  // R5: the demo account can't be made an admin
  it("rejects making the demo account an admin", async () => {
    await signUp(newUser("demo@example.com"));
    await db.execute(
      sql`update "user" set is_demo = true where email = 'demo@example.com'`,
    );

    const code = await postgresErrorCode(
      db.execute(
        sql`update "user" set role = 'admin' where email = 'demo@example.com'`,
      ),
    );

    expect(code).toBe(CHECK_VIOLATION);
  });

  // R5: an admin can't be marked as the demo account
  it("rejects making the admin account a demo account", async () => {
    await signUp(newUser("admin@example.com"));
    await db.execute(
      sql`update "user" set role = 'admin' where email = 'admin@example.com'`,
    );

    const code = await postgresErrorCode(
      db.execute(
        sql`update "user" set is_demo = true where email = 'admin@example.com'`,
      ),
    );

    expect(code).toBe(CHECK_VIOLATION);
  });

  // R5: a new row can't be created as both the demo account and an admin
  it("rejects inserting a demo account that is an admin", async () => {
    const code = await postgresErrorCode(
      db.execute(
        sql`insert into "user" (id, name, email, is_demo, role)
            values ('demo-admin-1', 'Demo Admin', 'demo-admin@example.com', true, 'admin')`,
      ),
    );

    expect(code).toBe(CHECK_VIOLATION);
  });

  // R6: a normal account can be made an admin
  it("allows a normal account to become an admin", async () => {
    await signUp(newUser("normal@example.com"));

    const code = await postgresErrorCode(
      db.execute(
        sql`update "user" set role = 'admin' where email = 'normal@example.com'`,
      ),
    );

    expect(code).toBe(null);
    expect(await roleOf("normal@example.com")).toBe("admin");
  });
});
