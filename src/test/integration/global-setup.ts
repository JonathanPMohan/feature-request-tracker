import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { assertTestDatabase } from "./test-database";

/**
 * Runs once before all integration tests: applies every migration in drizzle/
 * to the test database, so it always matches the current schema.
 */
export default async function globalSetup() {
  const url = assertTestDatabase(process.env.TEST_DATABASE_URL);

  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}
