// The app's auth instance (Better Auth). Server-only: it connects to the
// database and signs sessions with BETTER_AUTH_SECRET.
import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@/db";
import * as authSchema from "@/db/auth-schema";
import * as schema from "@/db/schema";

import { authOptions } from "./auth-options";

export const auth = betterAuth({
  ...authOptions,
  // Reuses the app's connection pool. Better Auth's tables are generated into
  // auth-schema.ts (npm run auth:generate); the app's own tables are in schema.ts.
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { ...schema, ...authSchema },
  }),
});
