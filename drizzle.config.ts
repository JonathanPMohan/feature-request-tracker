import { existsSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so it doesn't get Next's automatic .env loading.
// Node's built-in loader never overrides variables that are already set, so in
// CI and on Vercel the real environment always wins.
if (existsSync(".env")) process.loadEnvFile(".env");

// Migrations need a direct connection. Neon's pooled connection (DATABASE_URL on
// Vercel) runs in transaction mode, which lacks session features such as advisory
// locks that migration tools rely on. The Neon integration also sets
// DATABASE_URL_UNPOOLED. Locally there's no pooler, so DATABASE_URL is direct.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. For local development: cp .env.example .env",
  );
}

export default defineConfig({
  dialect: "postgresql",
  // The data model (Jonathan's). drizzle-kit compares it to the database to write migrations.
  schema: "./src/db/schema.ts",
  // Generated SQL migrations. Committed, reviewed like code, applied in order.
  out: "./drizzle",
  dbCredentials: { url },
});
