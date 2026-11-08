// Fails the build if this file is ever imported into code that runs in the browser,
// which would expose the connection string.
import "server-only";

import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. For local development: cp .env.example .env",
  );
}

// A pool keeps a few connections open and lends them out per query, instead of
// connecting from scratch on every request.
//
// In development, Next.js re-runs this file on every code change. Keeping the pool
// on globalThis reuses it, instead of leaking a new pool (and its connections)
// each time. Only in `next dev`: tests close the pool after each file, and a
// cached, closed pool would break the next file.
const globalForDb = globalThis as unknown as { pgPool?: Pool };
const pool = globalForDb.pgPool ?? new Pool({ connectionString });
if (process.env.NODE_ENV === "development") globalForDb.pgPool = pool;

// On Vercel, closes idle connections before the function instance is suspended.
// Does nothing anywhere else (it checks for Vercel's environment variables).
attachDatabasePool(pool);

export const db = drizzle({ client: pool, schema });
