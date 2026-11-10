// Tests for seedDemoAccount(), behind `npm run db:seed-demo`.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/auth/[...all]/route";
import { db } from "@/db";

import { DEMO_ACCOUNT } from "./demo-account";
import { seedDemoAccount } from "./seed-demo";

async function demoRows() {
  const { rows } = await db.execute<{ role: string; is_demo: boolean }>(
    sql`select role, is_demo from "user" where email = ${DEMO_ACCOUNT.email}`,
  );
  return rows;
}

describe("seedDemoAccount", () => {
  it("creates the demo account as a normal user, flagged as the demo", async () => {
    expect(await seedDemoAccount()).toBe("created");

    expect(await demoRows()).toEqual([{ role: "user", is_demo: true }]);
  });

  // It runs on every deploy, so running it again must change nothing.
  it("is safe to run again: still exactly one demo account", async () => {
    await seedDemoAccount();

    expect(await seedDemoAccount()).toBe("already-exists");
    expect(await demoRows()).toHaveLength(1);
  });

  // The flag is what the database rule and the permission check rely on. If
  // the account exists without it (e.g. created before the flag existed),
  // seeding sets it.
  it("flags an existing demo-email account that isn't flagged yet", async () => {
    await seedDemoAccount();
    await db.execute(
      sql`update "user" set is_demo = false where email = ${DEMO_ACCOUNT.email}`,
    );

    await seedDemoAccount();

    expect(await demoRows()).toEqual([{ role: "user", is_demo: true }]);
  });

  // The point of the demo: a reviewer can sign in with the password the
  // sign-in page shows. This goes through the real sign-in endpoint.
  it("can sign in with the public demo password", async () => {
    await seedDemoAccount();

    const response = await POST(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          email: DEMO_ACCOUNT.email,
          password: DEMO_ACCOUNT.password,
        }),
      }),
    );

    expect(response.status).toBe(200);
  });
});
