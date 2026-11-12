import "server-only";

import { count, desc, eq, inArray, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { featureRequest, vote } from "@/db/schema";

// Reading and creating feature requests (spec S1 to S5, S10). Pages and the
// submit action call these; nothing else touches the tables directly.

export const STATUSES = [
  "open",
  "planned",
  "in_progress",
  "shipped",
  "declined",
] as const;
export type Status = (typeof STATUSES)[number];

/** What the board shows with no filter (M5 decision A). */
export const ACTIVE_STATUSES: readonly Status[] = [
  "open",
  "planned",
  "in_progress",
];

export const STATUS_LABELS: Record<Status, string> = {
  open: "Open",
  planned: "Planned",
  in_progress: "In progress",
  shipped: "Shipped",
  declined: "Declined",
};

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
};

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
}: {
  filter: StatusFilter;
  page: number;
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
export async function getRequest(id: number): Promise<RequestDetail | null> {
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
