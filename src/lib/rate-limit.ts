import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";

// Per-user limits for requests, votes and comments (docs/PLAN.md). Sign-up is
// limited separately, by Better Auth. Starting guesses, to tune after real use.
export const RATE_LIMITS = {
  submit: { max: 10, windowSeconds: 60 * 60 },
  vote: { max: 60, windowSeconds: 60 },
  comment: { max: 20, windowSeconds: 10 * 60 },
} as const;

export type RateLimitedAction = keyof typeof RATE_LIMITS;

export type RateLimitResult =
  { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Records one attempt at `action` by this user, if they're under the limit.
 *
 * Built on Jonathan's `action_rate_limit` table (M4 decision E): one row per
 * user and action, holding a count and when the current window started.
 *
 * Call it LAST, after every other check that can refuse (spec S14, S15): it
 * has a side effect, because an allowed attempt uses up quota.
 */
export async function consumeRateLimit(
  userId: string,
  action: RateLimitedAction,
): Promise<RateLimitResult> {
  const { max, windowSeconds } = RATE_LIMITS[action];
  const windowLength = sql`make_interval(secs => ${windowSeconds})`;
  const windowOver = sql`r.window_start <= now() - ${windowLength}`;

  // ONE statement does the check and the increment (spec S13). Postgres locks
  // the row while it updates it, so a second request at the same moment waits,
  // then sees the new count. Reading the count in JavaScript and writing it
  // back would let two requests both read 9 and both write 10.
  //
  // - No row yet: insert one, starting a window with this attempt (count 1).
  // - A row whose window is over: start a new window (count 1).
  // - Otherwise: add 1, but only WHERE the count is under the limit. When the
  //   WHERE is false, nothing is updated and RETURNING gives no row: refused.
  //   A refused attempt doesn't change the count (S14).
  const { rows } = await db.execute(sql`
    insert into action_rate_limit as r (user_id, action, window_start, count)
    values (${userId}, ${action}, now(), 1)
    on conflict (user_id, action) do update set
      window_start = case when ${windowOver} then now() else r.window_start end,
      count = case when ${windowOver} then 1 else r.count + 1 end
    where ${windowOver} or r.count < ${max}
    returning r.count
  `);
  if (rows.length > 0) return { allowed: true };

  // Refused: say when the current window ends. Rounded up, and at least 1, so
  // the message never says "try again in 0 minutes".
  const { rows: refused } = await db.execute<{ seconds: number }>(sql`
    select ceil(extract(epoch from (r.window_start + ${windowLength} - now())))::int as seconds
    from action_rate_limit r
    where r.user_id = ${userId} and r.action = ${action}
  `);
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, refused[0]?.seconds ?? windowSeconds),
  };
}

/** The message a rate-limited user sees (M5 decision B). */
export function rateLimitMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `You've reached the limit for now. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}
