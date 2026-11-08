import { afterAll, beforeEach } from "vitest";

import { db } from "@/db";

import { resetDatabase } from "./reset-database";
import { assertTestDatabase } from "./test-database";

// Check the URL the app's db module actually received, not just the one we
// meant to give it.
assertTestDatabase(process.env.DATABASE_URL);

// Option A: wipe every table before each test, so no test depends on another's data.
beforeEach(async () => {
  await resetDatabase(db);
});

// Close the connection pool, or the test process waits on idle connections.
afterAll(async () => {
  await db.$client.end();
});
