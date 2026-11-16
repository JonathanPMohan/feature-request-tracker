import "server-only";

import { count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { featureRequest, vote } from "@/db/schema";

// Reading and creating feature requests (spec S1 to S5, S10). Pages and the
// submit action call these; nothing else touches the tables directly.

// The statuses live in statuses.ts, so client components can use them too.
// Re-exported here, so server code keeps one import.
import { ACTIVE_STATUSES, STATUSES, type Status } from "./statuses";

export {
  ACTIVE_STATUSES,
  isStatus,
  STATUS_LABELS,
  STATUSES,
  type Status,
} from "./statuses";

export type StatusFilter = "active" | "all" | Status;

export const PAGE_SIZE = 20;

// Postgres `integer` holds up to 2,147,483,647. A bigger id in a query isn't
// "not found", it's a database error (22003), so it's ruled out first.
const MAX_ID = 2_147_483_647;

/**
 * The `?status=` value from the URL. URLs are user input: anything unknown
 * means the default ("active"), never an error (spec S4).
 */
export function parseStatusFilter(
  value: string | string[] | undefined,
): StatusFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "all") return "all";
  if ((STATUSES as readonly string[]).includes(raw ?? "")) return raw as Status;
  return "active";
}

/** The `[id]` from `/requests/[id]`, or null if it can't be a request id (S5). */
export function parseRequestId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const id = Number(value);
  return id >= 1 && id <= MAX_ID ? id : null;
}

function statusCondition(filter: StatusFilter): SQL | undefined {
  if (filter === "all") return undefined;
  if (filter === "active")
    return inArray(featureRequest.status, ACTIVE_STATUSES);
  return eq(featureRequest.status, filter);
}

export type RequestSummary = {
  id: number;
  title: string;
  status: Status;
  createdAt: Date;
  votes: number;
  /** Whether the person viewing has voted for it (M6, V2). */
  votedByViewer: boolean;
};

/**
 * "Did this viewer vote?", answered from the votes the query already joins:
 * bool_or is true if any joined vote row is theirs. coalesce turns "no votes
 * at all" (null) into false. A visitor (no id) never has.
 */
function votedBy(viewerId: string | null) {
  return viewerId
    ? sql<boolean>`coalesce(bool_or(${vote.userId} = ${viewerId}), false)`
    : sql<boolean>`false`;
}

/**
 * One page of the board (S2, S3, S4). The same query as the M4 reference in
 * src/db/data-model.int.test.ts, written with Drizzle:
 * - LEFT JOIN, so requests with no votes still appear;
 * - count(vote.user_id), so they count as 0, not 1;
 * - id as the last tie-breaker, so pages never repeat or skip a request.
 */
export async function listRequests({
  filter,
  page,
  viewerId = null,
}: {
  filter: StatusFilter;
  page: number;
  /** The signed-in user's id, or null for a visitor. */
  viewerId?: string | null;
}): Promise<{ requests: RequestSummary[]; totalPages: number }> {
  const where = statusCondition(filter);
  const votes = count(vote.userId);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: featureRequest.id,
        title: featureRequest.title,
        status: featureRequest.status,
        createdAt: featureRequest.createdAt,
        votes,
        votedByViewer: votedBy(viewerId),
      })
      .from(featureRequest)
      .leftJoin(vote, eq(vote.requestId, featureRequest.id))
      .where(where)
      .groupBy(featureRequest.id)
      .orderBy(
        desc(votes),
        desc(featureRequest.createdAt),
        desc(featureRequest.id),
      )
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    // For the page numbers. Counting requests, not votes, so no join.
    db.select({ total: count() }).from(featureRequest).where(where),
  ]);

  return {
    // The CHECK on status guarantees one of STATUSES.
    requests: rows.map((row) => ({ ...row, status: row.status as Status })),
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export type RequestDetail = RequestSummary & {
  description: string;
  authorName: string;
};

/** One request, or null if there's no such request (S5). */
export async function getRequest(
  id: number,
  viewerId: string | null = null,
): Promise<RequestDetail | null> {
  const [row] = await db
    .select({
      id: featureRequest.id,
      title: featureRequest.title,
      description: featureRequest.description,
      status: featureRequest.status,
      createdAt: featureRequest.createdAt,
      // The name only. The email is selected nowhere, so no page can show
      // it by mistake (S6).
      authorName: user.name,
      votes: count(vote.userId),
      votedByViewer: votedBy(viewerId),
    })
    .from(featureRequest)
    .innerJoin(user, eq(user.id, featureRequest.authorId))
    .leftJoin(vote, eq(vote.requestId, featureRequest.id))
    .where(eq(featureRequest.id, id))
    .groupBy(featureRequest.id, user.name);

  return row ? { ...row, status: row.status as Status } : null;
}

/**
 * Saves a new request and its author's vote together (S10). PLAN.md: a new
 * request starts at 1 vote, its author's.
 *
 * In one transaction, so they succeed or fail together. Without it, a failure
 * between the two inserts would leave a request with 0 votes, which the rest
 * of the app assumes can't happen.
 *
 * Expects input that's already validated (request-input.ts) and an author
 * who's already allowed and under the rate limit (the submit action).
 */
export async function createRequestWithVote(input: {
  title: string;
  description: string;
  authorId: string;
}): Promise<number> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(featureRequest)
      .values(input)
      .returning({ id: featureRequest.id });
    await tx
      .insert(vote)
      .values({ requestId: created.id, userId: input.authorId });
    return created.id;
  });
}

/** What a permission check needs to know about the request it's about. */
export type ActionTarget = { id: number; status: Status };

/**
 * The request an action (a vote, a comment) is about, or null if there's no
 * such request.
 *
 * Takes `unknown` because it comes straight from an action's arguments or
 * form data, and a hand-made POST can send anything: a string, a fraction,
 * an object, a number too big for Postgres. All of those are "no such
 * request", the same as an id that simply doesn't exist, never a database
 * error.
 */
export async function findRequest(
  requestId: unknown,
): Promise<ActionTarget | null> {
  const id = toRequestId(requestId);
  if (id === null) return null;

  const [row] = await db
    .select({ id: featureRequest.id, status: featureRequest.status })
    .from(featureRequest)
    .where(eq(featureRequest.id, id));
  // The CHECK on status guarantees one of STATUSES.
  return row ? { id: row.id, status: row.status as Status } : null;
}

/**
 * Something that runs queries: the database itself, or a transaction.
 * Functions that take one can run inside withRequestLocked's transaction.
 */
export type Queryable =
  typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Runs `fn` in a transaction, with the request's row locked so its status
 * can't change until `fn` is done (M8, issue #14).
 *
 * `fn` gets the request (or null if there's no such request, for any
 * `requestId` a hand-made POST could send) and the transaction. Everything
 * that must agree with that status, the permission check and the write,
 * goes inside `fn`, and writes go through `tx`.
 *
 * FOR SHARE: many callers can hold the lock together, so votes don't wait
 * for each other. An UPDATE of the row (a status change) conflicts with it,
 * so the status can't change while anyone holds it. When `fn` returns, the
 * transaction commits and the lock is released; if it throws, it rolls back.
 */
export async function withRequestLocked<T>(
  requestId: unknown,
  fn: (request: ActionTarget | null, tx: Queryable) => Promise<T>,
): Promise<T> {
  const id = toRequestId(requestId);
  return db.transaction(async (tx) => {
    if (id === null) return fn(null, tx);
    const [row] = await tx
      .select({ id: featureRequest.id, status: featureRequest.status })
      .from(featureRequest)
      .where(eq(featureRequest.id, id))
      .for("share");
    return fn(row ? { id: row.id, status: row.status as Status } : null, tx);
  });
}

/**
 * Sets a request's status (M8). Returns false if there's no such request.
 * Expects a valid status and an admin: the action checks both first.
 */
export async function setStatus(id: number, status: Status): Promise<boolean> {
  const rows = await db
    .update(featureRequest)
    .set({ status })
    .where(eq(featureRequest.id, id))
    .returning({ id: featureRequest.id });
  return rows.length > 0;
}

/**
 * Deletes a request, and with it its votes and comments: Jonathan's ON
 * DELETE CASCADE from M4 (D6) does that inside Postgres. Returns false if
 * there was nothing to delete (a second admin, or a double-click, got there
 * first): not an error, just "already gone".
 */
export async function deleteRequest(id: number): Promise<boolean> {
  const rows = await db
    .delete(featureRequest)
    .where(eq(featureRequest.id, id))
    .returning({ id: featureRequest.id });
  return rows.length > 0;
}

/**
 * A request id from an action's arguments or form data, or null if it can't
 * be one. Numbers and digit strings only; everything else (fractions,
 * objects, numbers too big for Postgres) is null.
 */
export function toRequestId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return parseRequestId(String(value));
  }
  return typeof value === "string" ? parseRequestId(value) : null;
}
