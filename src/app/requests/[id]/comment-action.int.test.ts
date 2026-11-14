// Integration tests for the comment action (spec C4 to C10, decision C),
// calling it directly with any form data, the way a hand-made POST would.
// The database is real; only the session and Next.js's cache are faked.
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { createRequestWithVote, type Status } from "@/lib/requests";
import type { CurrentUser } from "@/lib/session";

import { addCommentAction } from "./comment-action";
import { COMMENT_MESSAGES } from "./comment-state";

const fake = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/lib/session", () => ({ getCurrentUser: async () => fake.user }));
// revalidatePath needs a running Next.js server; the fake records calls.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const { revalidatePath } = await import("next/cache");

let counter = 0;
async function createUser(overrides: Partial<CurrentUser> = {}) {
  counter += 1;
  const user: CurrentUser = {
    id: `commenter-${counter}`,
    name: "Commenter",
    email: `commenter-${counter}@example.com`,
    role: "user",
    isDemo: false,
    ...overrides,
  };
  await db.execute(
    sql`insert into "user" (id, name, email, is_demo)
        values (${user.id}, ${user.name}, ${user.email}, ${user.isDemo})`,
  );
  return user;
}

async function signInAs(overrides: Partial<CurrentUser> = {}) {
  fake.user = await createUser(overrides);
  return fake.user;
}

async function createRequest(status: Status = "open") {
  const author = await createUser({ name: "Author" });
  const id = await createRequestWithVote({
    title: "Dark mode",
    description: "Please.",
    authorId: author.id,
  });
  await db.execute(
    sql`update feature_request set status = ${status} where id = ${id}`,
  );
  return id;
}

function form(fields: Record<string, string | number>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields))
    data.set(name, String(value));
  return data;
}

const submit = (data: FormData) => addCommentAction({}, data);

async function commentCount() {
  const { rows } = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from comment`,
  );
  return rows[0].n;
}

async function quotaUsed() {
  const { rows } = await db.execute<{ n: number }>(
    sql`select coalesce(sum(count), 0)::int as n from action_rate_limit`,
  );
  return rows[0].n;
}

const uuid = /^[0-9a-f-]{36}$/;

beforeEach(() => {
  fake.user = null;
  vi.clearAllMocks();
});

describe("addCommentAction", () => {
  it("saves a comment and refreshes the request's page", async () => {
    const ada = await signInAs({ name: "Ada" });
    const request = await createRequest();
    const key = crypto.randomUUID();

    const state = await submit(
      form({
        requestId: request,
        body: "  +1\r\nMe too.  ",
        submissionKey: key,
      }),
    );

    expect(state).toEqual({
      saved: true,
      submissionKey: expect.stringMatching(uuid),
    });
    // A fresh key for the next comment, never the one just used.
    expect(state.submissionKey).not.toBe(key);
    const { rows } = await db.execute<{ body: string; author_id: string }>(
      sql`select body, author_id from comment where request_id = ${request}`,
    );
    expect(rows).toEqual([{ body: "+1\nMe too.", author_id: ada.id }]);
    expect(revalidatePath).toHaveBeenCalledWith(`/requests/${request}`);
  });

  // Decision C end to end: the same form sent twice (a double-click, or a
  // retry after the first answer got lost) is one comment, and both
  // attempts answer "saved".
  it("saves a double-submitted comment once", async () => {
    await signInAs();
    const request = await createRequest();
    const sameForm = form({
      requestId: request,
      body: "+1",
      submissionKey: crypto.randomUUID(),
    });

    const [first, second] = await Promise.all([
      submit(sameForm),
      submit(sameForm),
    ]);

    expect(first.saved).toBe(true);
    expect(second.saved).toBe(true);
    expect(await commentCount()).toBe(1);
  });

  // Decision A: comments go on after a decision (unlike votes).
  it.each(["shipped", "declined"] as const)(
    "allows comments on a %s request",
    async (status) => {
      await signInAs();
      const request = await createRequest(status);

      const state = await submit(
        form({
          requestId: request,
          body: "Which version?",
          submissionKey: crypto.randomUUID(),
        }),
      );

      expect(state.saved).toBe(true);
    },
  );

  // ── Refusals: each keeps the typed text and the SAME key, saves nothing,
  //    and uses no quota (C9: the rate limit is the last check). ───────────

  // C4: the hand-made POST from a signed-out visitor.
  it("refuses a visitor, whatever request id it sends", async () => {
    const request = await createRequest();
    const key = crypto.randomUUID();

    for (const requestId of [request, 12345, "abc"]) {
      expect(
        await submit(form({ requestId, body: "Hello", submissionKey: key })),
      ).toEqual({
        message: COMMENT_MESSAGES.signIn,
        body: "Hello",
        submissionKey: key,
      });
    }
    expect(await commentCount()).toBe(0);
    expect(await quotaUsed()).toBe(0);
  });

  // Decision B, on the server: the form is hidden from the demo account,
  // but a hand-made POST from a demo session must be refused too.
  it("refuses the demo account", async () => {
    await signInAs({ isDemo: true });
    const request = await createRequest();

    const state = await submit(
      form({
        requestId: request,
        body: "Hello",
        submissionKey: crypto.randomUUID(),
      }),
    );

    expect(state.message).toBe(COMMENT_MESSAGES.notAllowed);
    expect(await commentCount()).toBe(0);
    expect(await quotaUsed()).toBe(0);
  });

  // C8: whatever is sent as the request id, "not found", never a crash.
  it.each([
    ["an id that doesn't exist", 12345],
    ["text", "abc"],
    ["too big for Postgres integer", "99999999999"],
  ])("refuses %s as the request id", async (_name, requestId) => {
    await signInAs();

    const state = await submit(
      form({ requestId, body: "Hello", submissionKey: crypto.randomUUID() }),
    );

    expect(state.message).toBe(COMMENT_MESSAGES.notFound);
    expect(await quotaUsed()).toBe(0);
  });

  // C5, C6: the error is next to the box, the text is kept, and the key is
  // the same, so fixing the text and sending again is still one comment.
  it("refuses an empty comment, keeping the text and the key", async () => {
    await signInAs();
    const request = await createRequest();
    const key = crypto.randomUUID();

    expect(
      await submit(
        form({ requestId: request, body: " \n ", submissionKey: key }),
      ),
    ).toEqual({
      bodyError: "Comment can't be empty.",
      body: " \n ",
      submissionKey: key,
    });
    expect(await quotaUsed()).toBe(0);
  });

  // A broken or hand-made form with a bad key: refused before the database
  // sees it (the column is uuid), and given a good key to retry with.
  it("refuses a key that isn't a UUID, and sends a fresh one", async () => {
    await signInAs();
    const request = await createRequest();

    const state = await submit(
      form({ requestId: request, body: "Hello", submissionKey: "not-a-key" }),
    );

    expect(state).toEqual({
      message: COMMENT_MESSAGES.reload,
      body: "Hello",
      submissionKey: expect.stringMatching(uuid),
    });
    expect(await commentCount()).toBe(0);
    expect(await quotaUsed()).toBe(0);
  });

  // ── Found by /code-review ───────────────────────────────────────────────

  // Finding 1: a retry of a comment that was already saved (the answer got
  // lost, the person clicked again) is answered "saved" before the rate
  // limit, so it costs no quota and can't be refused at the limit.
  it("answers a retry of a saved comment without using quota", async () => {
    await signInAs();
    const request = await createRequest();
    const sameForm = form({
      requestId: request,
      body: "+1",
      submissionKey: crypto.randomUUID(),
    });

    expect((await submit(sameForm)).saved).toBe(true);
    expect((await submit(sameForm)).saved).toBe(true);

    expect(await commentCount()).toBe(1);
    expect(await quotaUsed()).toBe(1);
  });

  it("answers that retry even when the user is at the limit", async () => {
    await signInAs();
    const request = await createRequest();
    let lastForm = new FormData();
    for (let i = 0; i < 20; i++) {
      lastForm = form({
        requestId: request,
        body: `Comment ${i}`,
        submissionKey: crypto.randomUUID(),
      });
      await submit(lastForm);
    }

    // The 20th comment's answer was lost; the person sends it again.
    expect((await submit(lastForm)).saved).toBe(true);
    expect(await commentCount()).toBe(20);
  });

  // Finding 3: a key already used on ANOTHER request (a stale form, or a
  // hand-made POST) mustn't report "saved" while saving nothing. The person
  // keeps their text and gets a fresh key to send it with.
  it("asks for a reload when the key was used on another request", async () => {
    await signInAs();
    const first = await createRequest();
    const second = await createRequest();
    const key = crypto.randomUUID();
    await submit(
      form({ requestId: first, body: "On the first", submissionKey: key }),
    );

    const state = await submit(
      form({ requestId: second, body: "On the second", submissionKey: key }),
    );

    expect(state).toEqual({
      message: COMMENT_MESSAGES.reload,
      body: "On the second",
      submissionKey: expect.stringMatching(uuid),
    });
    expect(state.submissionKey).not.toBe(key);
    expect(await commentCount()).toBe(1);
  });

  // Finding 2: one definition of "a valid key". This one looks like a UUID
  // but has an invalid variant digit, which Zod (and RFC 9562) reject. It
  // must be replaced, or every retry would send it and fail again.
  it("replaces a key that only looks like a UUID", async () => {
    await signInAs();
    const request = await createRequest();
    const almost = "12345678-1234-1234-1234-123456789012";

    const state = await submit(
      form({ requestId: request, body: "Hello", submissionKey: almost }),
    );

    expect(state.message).toBe(COMMENT_MESSAGES.reload);
    expect(state.submissionKey).toMatch(uuid);
    expect(state.submissionKey).not.toBe(almost);
  });

  // C7: 20 comments per 10 minutes.
  it("refuses the 21st comment in 10 minutes, and saves nothing", async () => {
    await signInAs();
    const request = await createRequest();
    for (let i = 0; i < 20; i++) {
      const state = await submit(
        form({
          requestId: request,
          body: `Comment ${i}`,
          submissionKey: crypto.randomUUID(),
        }),
      );
      expect(state.saved).toBe(true);
    }

    const state = await submit(
      form({
        requestId: request,
        body: "One more",
        submissionKey: crypto.randomUUID(),
      }),
    );

    expect(state.message).toMatch(/Try again in 10 minutes\.$/);
    expect(state.body).toBe("One more");
    expect(await commentCount()).toBe(20);
  });
});
