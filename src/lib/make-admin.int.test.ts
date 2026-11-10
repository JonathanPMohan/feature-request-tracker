// Tests for makeAdmin(), the logic behind `npm run make-admin <email>`.
// They run against the test database, which is emptied before each test.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";

import { makeAdmin } from "./make-admin";

// Inserts an account directly. These tests are about promotion, not sign-up,
// so the quickest way to get an account is best.
async function createAccount(
  email: string,
  { role = "user", isDemo = false } = {},
) {
  await db.execute(
    sql`insert into "user" (id, name, email, role, is_demo)
        values (${email}, 'Test User', ${email}, ${role}, ${isDemo})`,
  );
}

async function roleOf(email: string) {
  const { rows } = await db.execute<{ role: string }>(
    sql`select role from "user" where email = ${email}`,
  );
  return rows[0]?.role;
}

describe("makeAdmin", () => {
  it("promotes a normal account", async () => {
    await createAccount("ada@example.com");

    expect(await makeAdmin("ada@example.com")).toBe("promoted");
    expect(await roleOf("ada@example.com")).toBe("admin");
  });

  // Emails are stored in lowercase. Someone typing the address the way it
  // appears in an email ("Ada@Example.com ") should still find the account.
  it("finds the account whatever the case or surrounding spaces", async () => {
    await createAccount("ada@example.com");

    expect(await makeAdmin("  Ada@Example.COM ")).toBe("promoted");
    expect(await roleOf("ada@example.com")).toBe("admin");
  });

  it("reports an account that is already an admin, and changes nothing", async () => {
    await createAccount("grace@example.com", { role: "admin" });

    expect(await makeAdmin("grace@example.com")).toBe("already-admin");
    expect(await roleOf("grace@example.com")).toBe("admin");
  });

  it("reports an email with no account", async () => {
    expect(await makeAdmin("nobody@example.com")).toBe("not-found");
  });

  // The rule from docs/PLAN.md: the script refuses the demo account itself,
  // with a clear message, before the database CHECK would have to.
  it("refuses the demo account and leaves it a normal user", async () => {
    await createAccount("demo@example.com", { isDemo: true });

    expect(await makeAdmin("demo@example.com")).toBe("refused-demo");
    expect(await roleOf("demo@example.com")).toBe("user");
  });
});
