// Auth settings shared by the app (src/lib/auth.ts) and the table generator
// (scripts/auth-schema.config.ts). Keeping one definition means the generated
// tables always match what the app runs. No database or secrets here.
import type { BetterAuthOptions } from "better-auth";
import { nextCookies } from "better-auth/next-js";

/**
 * Where the app lives, used for redirects and to check that requests come from
 * our own pages.
 *
 * - Local and production set BETTER_AUTH_URL to one fixed address.
 * - Vercel previews get a new address on every deploy, so they leave it unset.
 *   The address is then taken from each request, but only if it matches this
 *   project's preview hostnames. `*` can match across dots, which is acceptable
 *   because Vercel routes requests by hostname: only our own deployment's
 *   hostnames ever reach this code.
 * - A production deploy missing BETTER_AUTH_URL fails loudly: its hostname
 *   isn't in the preview list, so the first auth request throws.
 */
const baseURL = process.env.BETTER_AUTH_URL || {
  allowedHosts: ["feature-request-tracker-*-jonathanpmohan.vercel.app"],
};

export const authOptions = {
  baseURL,
  emailAndPassword: { enabled: true },
  // Must be the last plugin. It applies the cookies Better Auth sets (e.g. on
  // sign-in) when it's called from a Next.js server action.
  plugins: [nextCookies()],
} satisfies BetterAuthOptions;
