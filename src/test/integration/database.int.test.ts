import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";

import { resetDatabase } from "./reset-database";

// Checks that the integration test setup itself works. Tests for app features
// (requests, votes, comments) start in M4/M5.
describe("integration test database", () => {
  it("connects to the test database, never dev or production", async () => {
    const { rows } = await db.execute<{ name: string }>(
      sql`select current_database() as name`,
    );
    expect(rows[0]?.name).toBe("feature_requests_test");
  });

  it("has migrations applied by global setup", async () => {
    const { rows } = await db.execute<{ exists: boolean }>(
      sql`select to_regclass('drizzle.__drizzle_migrations') is not null as exists`,
    );
    expect(rows[0]?.exists).toBe(true);
  });

  it("resetDatabase empties every table in the app's schema", async () => {
    // A throwaway table stands in for real app tables, which don't exist yet.
    await db.execute(sql`create table reset_check (id int)`);
    try {
      await db.execute(sql`insert into reset_check values (1), (2)`);

      await resetDatabase(db);

      const { rows } = await db.execute<{ count: number }>(
        sql`select count(*)::int as count from reset_check`,
      );
      expect(rows[0]?.count).toBe(0);
    } finally {
      // Always clean up, even if the assertion fails, so the next run starts clean.
      await db.execute(sql`drop table reset_check`);
    }
  });
});
