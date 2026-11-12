import "server-only";

import { and, count, eq } from "drizzle-orm";

import { db } from "@/db";
import { featureRequest, vote } from "@/db/schema";

import { parseRequestId, type Status } from "./requests";

// Voting in the database (spec M6). The vote action calls these after its
// checks; nothing else writes to the vote table except submitting (M5).

/** What canVote needs to know about a request. */
export type VoteTarget = { id: number; status: Status };

/**
 * The request a vote is for, or null if there's no such request.
 *
 * Takes `unknown` because it comes straight from the action's arguments, and
 * a hand-made POST can send anything: a string, a fraction, an object, a
 * number too big for Postgres. All of those are "no such request" (V8), the
 * same as an id that simply doesn't exist, never a database error.
 */
export async function getVoteTarget(
  requestId: unknown,
): Promise<VoteTarget | null> {
  const id =
    typeof requestId === "number" && Number.isInteger(requestId)
      ? parseRequestId(String(requestId))
      : typeof requestId === "string"
        ? parseRequestId(requestId)
        : null;
  if (id === null) return null;

  const [row] = await db
    .select({ id: featureRequest.id, status: featureRequest.status })
    .from(featureRequest)
    .where(eq(featureRequest.id, id));
  // The CHECK on status guarantees one of STATUSES.
  return row ? { id: row.id, status: row.status as Status } : null;
}

/**
 * Sets this user's vote on a request to yes or no, and returns the new count.
 *
 * "Set", not "flip" (spec V4): repeating the same call changes nothing, so a
 * double-click, a retry or two tabs can never undo a vote by accident.
 * - Yes: insert, and if the vote is already there (the primary key on
 *   request + user says so), do nothing. No error, no second vote.
 * - No: delete. Deleting a vote that isn't there deletes nothing.
 *
 * Both are single statements, so even many at the same moment can't produce
 * two votes: the primary key decides, inside Postgres.
 */
export async function setVote(
  userId: string,
  requestId: number,
  voted: boolean,
): Promise<number> {
  if (voted) {
    await db.insert(vote).values({ userId, requestId }).onConflictDoNothing();
  } else {
    await db
      .delete(vote)
      .where(and(eq(vote.userId, userId), eq(vote.requestId, requestId)));
  }

  const [{ votes }] = await db
    .select({ votes: count() })
    .from(vote)
    .where(eq(vote.requestId, requestId));
  return votes;
}
