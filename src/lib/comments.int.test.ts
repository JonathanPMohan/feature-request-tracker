// Integration tests for reading and adding comments (spec C1, decision C).
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";

import { createComment, findCommentByKey, listComments } from "./comments";
import { createRequestWithVote } from "./requests";

let counter = 0;
async function createUser(name = "Commenter") {
  counter += 1;
  const id = `comment-user-${counter}`;
  await db.execute(
    sql`insert into "user" (id, name, email)
        values (${id}, ${name}, ${`${id}@example.com`})`,
  );
  return id;
}

async function createRequest() {
  return createRequestWithVote({
    title: "Dark mode",
    description: "Please.",
    authorId: await createUser("Author"),
  });
}

const newKey = () => crypto.randomUUID();

describe("createComment", () => {
  it("saves a comment", async () => {
    const request = await createRequest();
    const ada = await createUser("Ada");

    expect(
      await createComment({
        requestId: request,
        authorId: ada,
        body: "+1",
        submissionKey: newKey(),
      }),
    ).toEqual({ created: true });
    expect(await listComments(request)).toMatchObject([
      { body: "+1", authorName: "Ada" },
    ]);
  });

  // Decision C, the reason for the key: the same comment sent twice (a
  // double-click, a retry after a lost response) is saved once, and the
  // second attempt isn't an error.
  it("saves a comment once when it's sent twice with the same key", async () => {
    const request = await createRequest();
    const ada = await createUser();
    const comment = {
      requestId: request,
      authorId: ada,
      body: "+1",
      submissionKey: newKey(),
    };

    expect(await createComment(comment)).toEqual({ created: true });
    expect(await createComment(comment)).toEqual({ created: false });
    expect(await listComments(request)).toHaveLength(1);
  });

  // The same, at the same moment: the unique constraint decides inside
  // Postgres, so there's no race (unlike a "check first, then insert").
  it("saves it once when 10 copies arrive at the same moment", async () => {
    const request = await createRequest();
    const ada = await createUser();
    const comment = {
      requestId: request,
      authorId: ada,
      body: "+1",
      submissionKey: newKey(),
    };

    const results = await Promise.all(
      Array.from({ length: 10 }, () => createComment(comment)),
    );

    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await listComments(request)).toHaveLength(1);
  });

  // Control case: a deliberate second "+1" has a new key, so it's allowed.
  // This is what option 2 ("same text within 30 seconds") would have refused.
  it("saves the same text twice when the keys differ", async () => {
    const request = await createRequest();
    const ada = await createUser();
    for (let i = 0; i < 2; i++) {
      await createComment({
        requestId: request,
        authorId: ada,
        body: "+1",
        submissionKey: newKey(),
      });
    }

    expect(await listComments(request)).toHaveLength(2);
  });

  // Why the constraint is on (author, key), not the key alone: another
  // user's key can never block your comment.
  it("lets two people use the same key", async () => {
    const request = await createRequest();
    const sharedKey = newKey();
    for (const author of [await createUser("Ada"), await createUser("Grace")]) {
      expect(
        await createComment({
          requestId: request,
          authorId: author,
          body: "+1",
          submissionKey: sharedKey,
        }),
      ).toEqual({ created: true });
    }
  });
});

// Finding 4 from /code-review: the request can disappear between the
// action's check and the insert (once admins delete requests in M8). The
// foreign key refuses the insert; that must be an answer, not a crash.
describe("createComment on a request that's gone", () => {
  it("reports it instead of throwing", async () => {
    const ada = await createUser();

    expect(
      await createComment({
        requestId: 999999,
        authorId: ada,
        body: "+1",
        submissionKey: newKey(),
      }),
    ).toEqual({ created: false, requestGone: true });
  });
});

describe("findCommentByKey", () => {
  it("finds this author's comment with this key, and nobody else's", async () => {
    const request = await createRequest();
    const ada = await createUser();
    const grace = await createUser();
    const key = newKey();
    await createComment({
      requestId: request,
      authorId: ada,
      body: "+1",
      submissionKey: key,
    });

    expect(await findCommentByKey(ada, key)).toEqual({ requestId: request });
    expect(await findCommentByKey(grace, key)).toBeNull();
    expect(await findCommentByKey(ada, newKey())).toBeNull();
  });
});

describe("listComments", () => {
  it("lists oldest first, only this request's comments, without emails", async () => {
    const request = await createRequest();
    const other = await createRequest();
    const ada = await createUser("Ada");
    const grace = await createUser("Grace");
    for (const [requestId, authorId, body, at] of [
      [request, grace, "Second", "2026-01-02Z"],
      [request, ada, "First", "2026-01-01Z"],
      [other, ada, "Elsewhere", "2026-01-01Z"],
    ] as const) {
      await db.execute(
        sql`insert into comment (request_id, author_id, body, created_at)
            values (${requestId}, ${authorId}, ${body}, ${at})`,
      );
    }

    const comments = await listComments(request);

    expect(comments.map((c) => [c.body, c.authorName])).toEqual([
      ["First", "Ada"],
      ["Second", "Grace"],
    ]);
    expect(JSON.stringify(comments)).not.toContain("@example.com");
  });

  it("is empty for a request with no comments", async () => {
    expect(await listComments(await createRequest())).toEqual([]);
  });
});
