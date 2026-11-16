// Integration tests for the admin actions (spec A2 to A7), calling them
// directly with any arguments, the way a hand-made POST would. The database
// is real; only the session and Next.js's cache and redirect are faked (see
// M5's actions.int.test.ts for how).
//
// Jonathan's decision D: Jonathan writes the refusal tests (marked TODO
// below); Claude wrote the rest.
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { createRequestWithVote } from "@/lib/requests";
import type { CurrentUser } from "@/lib/session";

import {
  deleteCommentAction,
  deleteRequestAction,
  setStatusAction,
} from "./admin-actions";
import { ADMIN_MESSAGES } from "./admin-state";

// ── Fakes ───────────────────────────────────────────────────────────────────
const fake = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/lib/session", () => ({ getCurrentUser: async () => fake.user }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  // The real redirect() throws too, so the action stops at the same point.
  redirect: vi.fn((url: string) => {
    throw new Redirect(url);
  }),
}));

class Redirect extends Error {
  constructor(readonly url: string) {
    super(`redirect to ${url}`);
  }
}

const { revalidatePath } = await import("next/cache");

// ── Helpers ─────────────────────────────────────────────────────────────────
let counter = 0;
async function createUser(overrides: Partial<CurrentUser> = {}) {
  counter += 1;
  const user: CurrentUser = {
    id: `admin-test-${counter}`,
    name: "Someone",
    email: `admin-test-${counter}@example.com`,
    role: "user",
    isDemo: false,
    ...overrides,
  };
  await db.execute(
    sql`insert into "user" (id, name, email, role, is_demo)
        values (${user.id}, ${user.name}, ${user.email}, ${user.role}, ${user.isDemo})`,
  );
  return user;
}

async function signInAs(overrides: Partial<CurrentUser> = {}) {
  fake.user = await createUser(overrides);
  return fake.user;
}

const signInAsAdmin = () => signInAs({ role: "admin", name: "Admin" });

// A request by someone else, with a vote (its author's) and one comment.
async function createRequestWithComment() {
  const author = await createUser({ name: "Author" });
  const requestId = await createRequestWithVote({
    title: "Dark mode",
    description: "Please.",
    authorId: author.id,
  });
  const { rows } = await db.execute<{ id: number }>(
    sql`insert into comment (request_id, author_id, body)
        values (${requestId}, ${author.id}, 'Yes please!') returning id`,
  );
  return { requestId, commentId: rows[0].id };
}

async function statusOf(requestId: number) {
  const { rows } = await db.execute<{ status: string }>(
    sql`select status from feature_request where id = ${requestId}`,
  );
  return rows[0]?.status;
}

async function counts() {
  const { rows } = await db.execute<{
    requests: number;
    votes: number;
    comments: number;
  }>(sql`select (select count(*)::int from feature_request) as requests,
                (select count(*)::int from vote) as votes,
                (select count(*)::int from comment) as comments`);
  return rows[0];
}

// Runs an action that may redirect. Returns where it went, or its result.
async function run<T>(action: Promise<T>) {
  try {
    return { result: await action };
  } catch (error) {
    if (error instanceof Redirect) return { redirectedTo: error.url };
    throw error;
  }
}

beforeEach(() => {
  fake.user = null;
  vi.clearAllMocks();
});

// ── Refusals: ──────────────────────────────────────
// A2: everyone but an admin is refused, and nothing changes. For each one,
// check the answer is { ok: false, message: ADMIN_MESSAGES.notAllowed }, AND
// that the database is unchanged: statusOf(...) or counts(), as in the tests
// further down. The helpers above (signInAs, createRequestWithComment,
// statusOf, counts, run) are all you need.
describe("refusals", () => {
  describe("setStatusAction", () => {
    it("refuses a visitor, and the status stays the same", async () => {
      const { requestId } = await createRequestWithComment();

      expect(await setStatusAction(requestId, "planned")).toEqual({
        ok: false,
        message: ADMIN_MESSAGES.notAllowed,
      });
      expect(await statusOf(requestId)).toBe("open");
    });

    it("refuses a normal user, and the status stays the same", async () => {
      await signInAs();
      const { requestId } = await createRequestWithComment();

      expect(await setStatusAction(requestId, "planned")).toEqual({
        ok: false,
        message: ADMIN_MESSAGES.notAllowed,
      });
      expect(await statusOf(requestId)).toBe("open");
    });

    it("refuses the demo account, and the status stays the same", async () => {
      await signInAs({ isDemo: true });
      const { requestId } = await createRequestWithComment();

      expect(await setStatusAction(requestId, "planned")).toEqual({
        ok: false,
        message: ADMIN_MESSAGES.notAllowed,
      });
      expect(await statusOf(requestId)).toBe("open");
    });
  });

  describe("deleteRequestAction", () => {
    it("refuses a visitor, and the request, votes and comments stay", async () => {
      const { requestId } = await createRequestWithComment();

      expect(await run(deleteRequestAction(requestId))).toEqual({
        result: { ok: false, message: ADMIN_MESSAGES.notAllowed },
      });
      expect(await counts()).toEqual({ requests: 1, votes: 1, comments: 1 });
    });

    it("refuses a normal user, and the request, votes and comments stay", async () => {
      await signInAs();
      const { requestId } = await createRequestWithComment();

      expect(await run(deleteRequestAction(requestId))).toEqual({
        result: { ok: false, message: ADMIN_MESSAGES.notAllowed },
      });
      expect(await counts()).toEqual({ requests: 1, votes: 1, comments: 1 });
    });

    it("refuses the demo account, and the request, votes and comments stay", async () => {
      await signInAs({ isDemo: true });
      const { requestId } = await createRequestWithComment();

      expect(await run(deleteRequestAction(requestId))).toEqual({
        result: { ok: false, message: ADMIN_MESSAGES.notAllowed },
      });
      expect(await counts()).toEqual({ requests: 1, votes: 1, comments: 1 });
    });
  });

  describe("deleteCommentAction", () => {
    it("refuses a visitor, and the comment stays", async () => {
      const { commentId } = await createRequestWithComment();

      expect(await deleteCommentAction(commentId)).toEqual({
        ok: false,
        message: ADMIN_MESSAGES.notAllowed,
      });
      expect((await counts()).comments).toBe(1);
    });

    it("refuses a normal user, and the comment stays", async () => {
      await signInAs();
      const { commentId } = await createRequestWithComment();

      expect(await deleteCommentAction(commentId)).toEqual({
        ok: false,
        message: ADMIN_MESSAGES.notAllowed,
      });
      expect((await counts()).comments).toBe(1);
    });

    it("refuses the demo account, and the comment stays", async () => {
      await signInAs({ isDemo: true });
      const { commentId } = await createRequestWithComment();

      expect(await deleteCommentAction(commentId)).toEqual({
        ok: false,
        message: ADMIN_MESSAGES.notAllowed,
      });
      expect((await counts()).comments).toBe(1);
    });
  });
});

// ── Admins (Claude) ─────────────────────────────────────────────────────────

describe("setStatusAction", () => {
  it("lets an admin change a status, and refreshes the board and the page", async () => {
    await signInAsAdmin();
    const { requestId } = await createRequestWithComment();

    expect(await setStatusAction(requestId, "planned")).toEqual({ ok: true });

    expect(await statusOf(requestId)).toBe("planned");
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith(`/requests/${requestId}`);
  });

  // Decision A: any status to any status, including back from a decision.
  it("lets an admin move a request back from shipped", async () => {
    await signInAsAdmin();
    const { requestId } = await createRequestWithComment();
    await setStatusAction(requestId, "shipped");

    expect(await setStatusAction(requestId, "open")).toEqual({ ok: true });
    expect(await statusOf(requestId)).toBe("open");
  });

  // A3: a bad status is a message, before the database's CHECK sees it.
  it.each([
    ["a status with the wrong case", "SHIPPED"],
    ["the label instead of the value", "In progress"],
    ["nothing", undefined],
    ["a number", 1],
  ])("refuses %s as a status", async (_name, status) => {
    await signInAsAdmin();
    const { requestId } = await createRequestWithComment();

    expect(await setStatusAction(requestId, status)).toEqual({
      ok: false,
      message: ADMIN_MESSAGES.invalidStatus,
    });
    expect(await statusOf(requestId)).toBe("open");
  });

  // A7: odd ids are "doesn't exist", never a crash.
  it.each([
    ["an id that doesn't exist", 12345],
    ["text", "abc"],
    ["too big for Postgres integer", 99999999999],
  ])("answers 'doesn't exist' for %s", async (_name, requestId) => {
    await signInAsAdmin();

    expect(await setStatusAction(requestId, "planned")).toEqual({
      ok: false,
      message: ADMIN_MESSAGES.requestGone,
    });
  });
});

describe("deleteRequestAction", () => {
  // A4: the request, its votes and its comments go; the admin lands on the
  // board.
  it("lets an admin delete a request with its votes and comments", async () => {
    await signInAsAdmin();
    const { requestId } = await createRequestWithComment();

    expect(await run(deleteRequestAction(requestId))).toEqual({
      redirectedTo: "/",
    });

    expect(await counts()).toEqual({ requests: 0, votes: 0, comments: 0 });
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  // A7: the second admin, or the double-click, is told it's already gone.
  it("answers 'doesn't exist' when it's already deleted", async () => {
    await signInAsAdmin();
    const { requestId } = await createRequestWithComment();
    await run(deleteRequestAction(requestId));

    expect(await run(deleteRequestAction(requestId))).toEqual({
      result: { ok: false, message: ADMIN_MESSAGES.requestGone },
    });
  });

  it.each([
    ["text", "abc"],
    ["an object", { id: 1 }],
  ])("answers 'doesn't exist' for %s as the id", async (_name, requestId) => {
    await signInAsAdmin();
    await createRequestWithComment();

    expect(await run(deleteRequestAction(requestId))).toEqual({
      result: { ok: false, message: ADMIN_MESSAGES.requestGone },
    });
    expect((await counts()).requests).toBe(1);
  });
});

describe("deleteCommentAction", () => {
  it("lets an admin delete a comment, and refreshes its request's page", async () => {
    await signInAsAdmin();
    const { requestId, commentId } = await createRequestWithComment();

    expect(await deleteCommentAction(commentId)).toEqual({ ok: true });

    expect(await counts()).toEqual({ requests: 1, votes: 1, comments: 0 });
    expect(revalidatePath).toHaveBeenCalledWith(`/requests/${requestId}`);
  });

  it("answers 'doesn't exist' when it's already deleted", async () => {
    await signInAsAdmin();
    const { commentId } = await createRequestWithComment();
    await deleteCommentAction(commentId);

    expect(await deleteCommentAction(commentId)).toEqual({
      ok: false,
      message: ADMIN_MESSAGES.commentGone,
    });
  });

  it.each([
    ["an id that doesn't exist", 12345],
    ["text", "abc"],
  ])("answers 'doesn't exist' for %s as the id", async (_name, commentId) => {
    await signInAsAdmin();
    await createRequestWithComment();

    expect(await deleteCommentAction(commentId)).toEqual({
      ok: false,
      message: ADMIN_MESSAGES.commentGone,
    });
    expect((await counts()).comments).toBe(1);
  });
});
