import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";

import { GET, POST } from "./route";

// Posts straight to the sign-up endpoint, the way a script would. The form's
// `minLength` never runs here, so this tests the server's own rule.
function signUpWithPassword(email: string, password: string) {
  return POST(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({ email, password, name: "Test User" }),
    }),
  );
}

async function userExists(email: string) {
  const { rows } = await db.execute(
    sql`select 1 from "user" where email = ${email}`,
  );
  return rows.length > 0;
}

describe("Better Auth route handler", () => {
  it("responds to its health check, proving the config and handler load", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/auth/ok"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("returns 404 for an auth endpoint that doesn't exist", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/auth/not-a-real-endpoint"),
    );

    expect(response.status).toBe(404);
  });
});

// The demo account's password is public, so these endpoints are turned off
// for everyone (see disabledPaths in auth-options.ts). Tested while signed
// in: a 404 for a visitor alone could just mean "you need to sign in first".
describe("disabled endpoints", () => {
  it.each([
    ["POST", "/change-password"],
    ["POST", "/update-user"],
    ["GET", "/list-sessions"],
    ["POST", "/revoke-session"],
    ["POST", "/revoke-sessions"],
    ["POST", "/revoke-other-sessions"],
  ])("%s %s returns 404 even when signed in", async (method, path) => {
    const signUp = await signUpWithPassword(
      "signed-in@example.com",
      "12345678",
    );
    const cookie = signUp.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    expect(cookie).not.toBe("");

    const handler = method === "GET" ? GET : POST;
    const response = await handler(
      new Request(`http://localhost:3000/api/auth${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          cookie,
        },
        body: method === "GET" ? undefined : JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(404);
  });
});

// Better Auth's default minimum is 8 characters. Testing both sides of the
// boundary (7 fails, 8 works) proves where the line is, not just that some
// short password fails.
describe("sign-up password length", () => {
  it("rejects a 7-character password and creates no account", async () => {
    const response = await signUpWithPassword("short@example.com", "1234567");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "PASSWORD_TOO_SHORT" });
    expect(await userExists("short@example.com")).toBe(false);
  });

  it("accepts an 8-character password", async () => {
    const response = await signUpWithPassword("eight@example.com", "12345678");

    expect(response.status).toBe(200);
    expect(await userExists("eight@example.com")).toBe(true);
  });
});
