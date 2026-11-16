// Spec A9: a demoted admin loses admin rights on their very next request.
//
// The other admin tests fake the session, so they can't test this: a fake
// returns whatever role the test gives it. Here the session is REAL: the
// user signs up through Better Auth's route, and the action reads that
// session cookie through the real getCurrentUser. Only Next.js's request
// headers are faked, to carry the cookie, because there's no browser.
//
// Why it holds: Better Auth's cookie cache is off unless it's turned on
// (we don't), so every session read gets the user, and their role, from
// the database.
import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { createRequestWithVote } from "@/lib/requests";

import { POST } from "../../api/auth/[...all]/route";
import { setStatusAction } from "./admin-actions";
import { ADMIN_MESSAGES } from "./admin-state";

const fake = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: fake.cookie }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

async function signUp(email: string) {
  const response = await POST(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({
        email,
        password: "correct-horse-battery-staple",
        name: "Soon Admin",
      }),
    }),
  );
  expect(response.status).toBe(200);
  // "name=value; HttpOnly; ..." → "name=value", what a browser sends back.
  fake.cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function setRole(email: string, role: "user" | "admin") {
  await db.execute(
    sql`update "user" set role = ${role} where email = ${email}`,
  );
}

describe("a real session", () => {
  it("loses admin rights on the next request after a demotion", async () => {
    const email = `demoted-${Date.now()}@example.com`;
    await signUp(email);
    const request = await createRequestWithVote({
      title: "Dark mode",
      description: "Please.",
      authorId: (
        await db.execute<{ id: string }>(
          sql`select id from "user" where email = ${email}`,
        )
      ).rows[0].id,
    });

    // Promoted (as make-admin does): the same session can change a status.
    await setRole(email, "admin");
    expect(await setStatusAction(request, "planned")).toEqual({ ok: true });

    // Demoted: the very next call, with the same cookie, is refused.
    await setRole(email, "user");
    expect(await setStatusAction(request, "shipped")).toEqual({
      ok: false,
      message: ADMIN_MESSAGES.notAllowed,
    });
    const { rows } = await db.execute<{ status: string }>(
      sql`select status from feature_request where id = ${request}`,
    );
    expect(rows[0].status).toBe("planned");
  });
});
