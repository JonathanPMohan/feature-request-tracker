// Used only by `npm run auth:generate` to write src/db/auth-schema.ts.
//
// The generator can't load src/lib/auth.ts: that file imports "server-only"
// (which throws outside Next.js) and connects to the database. This file uses
// the same shared options without a database; the generator is told the
// adapter (drizzle) and dialect (postgresql) on the command line instead.
import { betterAuth } from "better-auth";

import { authOptions } from "../src/lib/auth-options";

export const auth = betterAuth(authOptions);
