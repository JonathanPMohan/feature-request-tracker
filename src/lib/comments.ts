import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { comment } from "@/db/schema";

// Reading and adding comments (spec M7). Pages and the comment action call
// these; nothing else writes to the comment table.

export type CommentView = {
  id: number;
  body: string;
  authorName: string;
  createdAt: Date;
};

/**
 * A request's comments, oldest first, like a conversation (C1). Served by
 * Jonathan's (request_id, created_at) index from M4. The id breaks ties, so
 * two comments in the same instant always show in the same order.
 */
export async function listComments(requestId: number): Promise<CommentView[]> {
  return db
    .select({
      id: comment.id,
      body: comment.body,
      // The name only, never the email (C1).
      authorName: user.name,
      createdAt: comment.createdAt,
    })
    .from(comment)
    .innerJoin(user, eq(user.id, comment.authorId))
    .where(eq(comment.requestId, requestId))
    .orderBy(asc(comment.createdAt), asc(comment.id));
}

/**
 * Saves a comment, unless this author already saved one with this key
 * (Jonathan's decision C). Returns whether a new row was written.
 *
 * ON CONFLICT on Jonathan's unique constraint makes a double-submit, or a
 * retry after a lost response, a no-op instead of a second comment. Postgres
 * decides inside one statement, so it holds even when both arrive at once.
 * "Already saved" isn't an error: the comment the person wrote exists.
 */
export async function createComment(input: {
  requestId: number;
  authorId: string;
  body: string;
  submissionKey: string;
}): Promise<{ created: boolean; requestGone?: true }> {
  try {
    const rows = await db
      .insert(comment)
      .values(input)
      .onConflictDoNothing({
        target: [comment.authorId, comment.submissionKey],
      })
      .returning({ id: comment.id });
    return { created: rows.length > 0 };
  } catch (error) {
    // The request was deleted after the action checked it (possible once
    // admins delete requests, M8): the foreign key refuses the insert with
    // 23503. That's an answer for the user, not a crash (/code-review).
    if (postgresCode(error) === "23503") {
      return { created: false, requestGone: true };
    }
    throw error;
  }
}

/**
 * The comment this author already saved with this key, if any (decision C).
 *
 * The action asks this before the rate limit, so a retry of a comment that
 * was already saved is answered "saved" without using quota, and a key
 * already used on another request is noticed instead of silently saving
 * nothing (both found by /code-review). Served by Jonathan's unique index.
 */
export async function findCommentByKey(
  authorId: string,
  submissionKey: string,
): Promise<{ requestId: number } | null> {
  const [row] = await db
    .select({ requestId: comment.requestId })
    .from(comment)
    .where(
      and(
        eq(comment.authorId, authorId),
        eq(comment.submissionKey, submissionKey),
      ),
    );
  return row ?? null;
}

// Drizzle wraps the driver's error, so the Postgres code can be one level down.
function postgresCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } };
  return e.code ?? e.cause?.code;
}
