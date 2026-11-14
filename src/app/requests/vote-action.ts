"use server";

import { canVote } from "@/lib/permissions";
import { consumeRateLimit, rateLimitMessage } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";
import { findRequest } from "@/lib/requests";
import { setVote } from "@/lib/votes";

import { VOTE_MESSAGES, type VoteResult } from "./vote-state";

// SECURITY: like every "use server" export, this is a public POST endpoint.
// Anyone can call it with any arguments, signed in or not, without the page.
// The M6 walkthrough shows that from the command line.

/**
 * Sets the current user's vote on a request to yes (`voted: true`) or no
 * (spec V1 to V10).
 *
 * "Set", not "flip" (V4): the button asks for the opposite of what it shows,
 * so a double-click sends "yes" twice and leaves one vote.
 *
 * Both arguments are `unknown` on purpose. TypeScript types don't exist at
 * runtime: a hand-made POST can send a string, an object, anything. The
 * steps below check them.
 *
 * No revalidatePath here: refreshing the board after each click would
 * re-sort it under the user's cursor (V6). The button keeps the new count;
 * pages load fresh counts on the next visit.
 */
export async function setVoteAction(
  requestId: unknown,
  voted: unknown,
): Promise<VoteResult> {
  // ── Step 1: who is this? ────────────────────────────────────────────────
  const user = await getCurrentUser();

  // ── Step 2: are they allowed? ───────────────────────────────────────────
  // a. Visitors must sign in.
  if (user === null) {
    return { ok: false, message: VOTE_MESSAGES.signIn };
  }

  // b. Does the request exist?
  const target = await findRequest(requestId);
  if (target === null) {
    return { ok: false, message: VOTE_MESSAGES.notFound };
  }

  // c. The demo account and closed requests can't vote.
  if (!canVote(user, target)) {
    return { ok: false, message: VOTE_MESSAGES.notAllowed };
  }

  // ── Step 3: is the input valid? ─────────────────────────────────────────
  // Only true or false. Not "true", not 1: a hand-made POST could send those,
  // and guessing what they meant is how bugs get in.
  if (typeof voted !== "boolean") {
    return { ok: false, message: VOTE_MESSAGES.invalid };
  }

  // ── Step 4: under the limit? Last, because it uses up quota. ────────────
  const result = await consumeRateLimit(user.id, "vote");
  if (!result.allowed) {
    return { ok: false, message: rateLimitMessage(result.retryAfterSeconds) };
  }

  // ── Step 5: save ────────────────────────────────────────────────────────
  const votes = await setVote(user.id, target.id, voted);
  return { ok: true, voted, votes };
}
