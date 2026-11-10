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
  /**
   * Endpoints turned off (404) for everyone. v1 has no UI for any of them, and
   * the demo account's password is public, so in a visitor's hands each one
   * could spoil the demo for every other reviewer:
   * - change-password: lock everyone out
   * - update-user: rename the shared account to something offensive
   * - list-sessions: see other reviewers' IP addresses and browsers
   * - revoke-session(s), revoke-other-sessions: sign every other reviewer out
   * Fewer endpoints is also less to secure. Turn one back on only with a
   * permission check that refuses the demo account.
   */
  disabledPaths: [
    "/change-password",
    "/update-user",
    "/list-sessions",
    "/revoke-session",
    "/revoke-sessions",
    "/revoke-other-sessions",
  ],
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true, // R1: every account has a role
        input: false, // R3: only server code can set this
        defaultValue: "user", // R2: new accounts are 'user'
      },
      isDemo: {
        type: "boolean", // true means this is the public demo account
        required: true, // never empty, so the R5 rule always has a clear answer
        input: false, // R3: only server code can set this
        defaultValue: false, // new sign-ups are never the demo account
      },
    },
  },
  /**
   * How long a sign-in lasts. These are Better Auth's defaults, written out
   * because the tests depend on them and a reviewer will ask.
   * - A session expires 7 days after it was last extended.
   * - Using a session that's more than a day old extends it by 7 days, so
   *   people who visit regularly stay signed in, and an abandoned session
   *   (like one on a shared computer) expires within a week.
   * Each session is a row in the `session` table, so signing out deletes it,
   * and a copied cookie stops working everywhere at once.
   */
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  /**
   * Rate limits for every request to /api/auth/*, counted per client IP.
   *
   * - On everywhere (Better Auth's default is production only), so dev and the
   *   integration tests run the same rules as the live site.
   * - Stored in Postgres, not memory. Vercel runs many short-lived servers;
   *   each would keep its own in-memory count, so the limit would barely apply.
   *   The check and the increment are one conditional UPDATE, so simultaneous
   *   requests can't all slip under the limit.
   * - Sign-up: 5 per hour (docs/PLAN.md). The window restarts at the last
   *   allowed request, so after 5 an IP must stay quiet for a full hour.
   * - Everything else keeps Better Auth's defaults: sign-in 3 per 10 seconds,
   *   other endpoints 100 per 10 seconds.
   */
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/sign-up/email": { window: 60 * 60, max: 5 },
    },
  },
  advanced: {
    ipAddress: {
      // The client's IP. On Vercel this header is set by Vercel itself and
      // overwrites any value a visitor sends, so it can't be spoofed. (It's
      // Better Auth's default; written out because the limit depends on it.)
      ipAddressHeaders: ["x-forwarded-for"],
    },
  },
  // Must be the last plugin. It applies the cookies Better Auth sets (e.g. on
  // sign-in) when it's called from a Next.js server action.
  plugins: [nextCookies()],
} satisfies BetterAuthOptions;
