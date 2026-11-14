import "server-only";

import { and, count, eq } from "drizzle-orm";

import { db } from "@/db";
import { vote } from "@/db/schema";

// Voting in the database (spec M6). The vote action calls these after its
// checks; nothing else writes to the vote table except submitting (M5).
// The request lookup both actions use is findRequest, in requests.ts.

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
