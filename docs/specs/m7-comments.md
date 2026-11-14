# Spec: comments (M7)

**Owner:** Claude writes the comment list and form, the action's other steps, the queries and all tests. Jonathan writes the permission check and the action's authorization steps (🧑 below), and makes the three decisions at the end. Decision C may add a small change to his data model.

M7 adds a conversation to each request: anyone can read it, signed-in users can join it. It follows the same pattern as M5 and M6, so this spec focuses on what's different.

## Rules

Each rule is tested. **Server** means it holds even when someone skips the UI and sends the POST themselves.

| #   | Rule                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | Anyone can read a request's comments on its page, oldest first, like a conversation. Each shows the author's name and date. Never the email.                                                                 |
| C2  | Comments are shown as text, never as HTML, with the author's line breaks kept.                                                                                                                               |
| C3  | A signed-in user can add a comment from the request's page. A visitor sees a "Sign in to comment" link instead of the form.                                                                                  |
| C4  | **Server:** a visitor's comment is refused, even sent directly. Nothing is saved and no quota is used.                                                                                                       |
| C5  | **Server:** the body is validated like a request's description (M5, S8): trimmed, `\r\n` counted once, 1 to 2,000 characters counted the way Postgres counts, at least one visible character.                |
| C6  | Errors show next to the field and keep what was typed. After a successful comment, it appears at once, and the box is empty again.                                                                           |
| C7  | **Server:** 20 comments per user per 10 minutes (PLAN.md), counted by `consumeRateLimit(user.id, "comment")`. Over the limit: refused with "try again in N minutes", nothing saved.                          |
| C8  | **Server:** a request id that doesn't exist, or can't, is refused with a message, never a crash.                                                                                                             |
| C9  | **Server:** the action's steps run in PLAN.md's order: who is this → are they allowed → is the input valid → under the limit → save. A visitor is told to sign in before anything else (M5 and M6's lesson). |
| C10 | Decisions A, B and C below hold, on the server.                                                                                                                                                              |

## What's new: a comment can't be "set"

In M6, a double-click was harmless because the action said "set my vote to yes": doing it twice leaves one vote. A comment is different. **"Add this comment" done twice is two comments.** There's no "already there" for the database to notice, because two identical comments are allowed in general ("+1", "Thanks!").

So something has to decide whether the second one is a duplicate, and that's decision C. The submit button is disabled while the comment is being sent, as in M5, but as M6's walkthrough showed, the browser isn't a security boundary: a retry after a timeout, or a slow network, can still send it twice.

## Who writes what

| File                                       | What                                                 | Who                  |
| ------------------------------------------ | ---------------------------------------------------- | -------------------- |
| `src/lib/permissions.ts`                   | `canComment(user, request)`                          | 🧑 Jonathan          |
| `src/app/requests/[id]/comment-action.ts`  | `addComment`, with marked slots for steps 1, 2 and 4 | Claude, 🧑 the slots |
| `src/db/schema.ts` + a migration           | Only if decision C needs it                          | 🧑 Jonathan          |
| `src/lib/comments.ts`                      | `listComments(requestId)`, `createComment(...)`      | Claude               |
| `src/lib/request-input.ts`                 | The text rules, shared with the comment body         | Claude               |
| `src/app/requests/[id]/comments.tsx`, form | The list and the form                                | Claude               |
| Tests (below)                              | All of them                                          | Claude               |

As in M5 and M6: I write everything first, with your parts throwing `Not implemented yet`, so the tests that need them fail until you fill them in.

### 🧑 Your pieces

**1. `canComment`** in `src/lib/permissions.ts`:

```ts
export function canComment(
  user: CurrentUser | null,
  request: { status: Status },
): boolean;
```

A plain `boolean`, like `canVote`, if decisions A or B can refuse a signed-in user. If neither does, it only refuses visitors, and `user is CurrentUser` (like `canSubmitRequest`) would be honest. Pick the return type that tells the truth about your rule; M6 showed why it matters.

**2. Steps 1, 2 and 4** in `addComment`, as in M6's vote action: who is this, are they allowed (visitor first, then the request, then `canComment`), and the rate limit.

**3. Only if decision C is "a submission key":** a column and a unique constraint, and its migration. Details under decision C.

## Tests (Claude)

| File                                               | Type        | Covers                                                                                                                                                |
| -------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/permissions.test.ts`                      | unit        | `canComment`: visitor, user, admin, demo, each status, per decisions A and B                                                                          |
| `src/lib/request-input.test.ts`                    | unit        | C5: the comment body's limits, sharing the text rules with requests                                                                                   |
| `src/lib/comments.int.test.ts`                     | integration | C1: oldest first, author name without email, only this request's comments                                                                             |
| `src/app/requests/[id]/comment-action.int.test.ts` | integration | C4, C7 to C10 through the real action: visitor, odd ids, invalid bodies use no quota, the 21st comment in 10 minutes refused, decision C's duplicates |
| `e2e/comments.spec.ts`                             | end to end  | Read comments signed out; add one and see it at once with the box cleared; an error keeps the typed text; HTML shown as text                          |

**On deployed runs,** the tests that add comments are skipped. Reading runs everywhere.

## 🧑 Decisions

Write a sentence for each under "Jonathan's decisions" at the end.

### A. Can people comment on shipped or declined requests?

| Option                      | For                                                                                       | Against                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Any status**              | The conversation continues after a decision: "Which version shipped it?", "Why declined?" | Old threads stay open forever                              |
| **Only active, like votes** | Consistent with decision A in M6; a decided request is closed in every way                | The people most affected by a decision can't respond to it |

Votes and comments don't have to match: votes are a signal for deciding, comments are a conversation.

### B. Can the demo account comment?

Comments are public and appear under the author's name. A demo comment shows as "Demo User", written by whoever happens to be using the demo.

| Option  | For                                            | Against                                                                                                                  |
| ------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Yes** | Reviewers can try the feature                  | Anyone can post publicly without signing up (20 per 10 minutes, shared): an easy spam path, and you answer for the words |
| **No**  | Every public comment comes from a real account | Reviewers can't try commenting without signing up                                                                        |

### C. What stops a double-submitted comment?

| Option                                                                                                                                                                                                                  | For                                                                                                                         | Against                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Only the disabled button**                                                                                                                                                                                         | Nothing to build                                                                                                            | A retry after a timeout posts twice. Not "enforced on the server"                                                                                        |
| **2. Refuse an identical body from the same user on the same request within, say, 30 seconds** (a query before the insert)                                                                                              | No schema change                                                                                                            | Two requests at the same moment both see "no duplicate" and both insert: the same race the rate limit fixed in M5. Also refuses a deliberate second "+1" |
| **3. A submission key:** the form carries a random key, made once per comment you write. The `comment` table gets a `submission_key` column with a unique constraint per author. The same key twice is the same comment | The database decides, so it holds under any race, like M6's primary key. A real second "+1" gets a new key, so it's allowed | A schema change and a migration (yours): one column, one unique constraint. Existing comments have no key, so the column must allow null                 |

Option 3 is the standard answer ("idempotency key") and the one I'd pick: it's M6's "let the database decide" applied to something that can't be a set. If you choose it, the migration is yours: a nullable `submission_key` column, and a unique constraint on `(author_id, submission_key)`. Postgres treats each null as distinct, so old comments without a key never conflict.

## Out of scope

Editing or deleting your own comment (not in v1), admin deletion (M8), replies and threads, comment counts on the board, and paging long conversations: the rate limit keeps them small for now.

## Jonathan's decisions

**A. Comments on all statuses.** Comments are a conversation that can continue after a decision.

**B. The demo account can't comment.** It's shared, so its comments would be anonymous and an easy spam path.

**C. A submission key with a unique constraint.** Double-submits: a submission key with a unique constraint. Each comment form gets a random key, and a unique constraint on (author_id, submission_key) means the same key can only save one comment, so a double-click or retry can’t create a duplicate. It’s scoped to the author so no one can block another person’s comment by reusing their key. The column is uuid NOT NULL DEFAULT gen_random_uuid(), so every comment has a key, including existing ones. I dropped comment_author_id_idx because the unique constraint’s index starts with author_id and already covers lookups by author.

`canComment` returns `boolean`: decision B refuses a signed-in user, so a type predicate would tell TypeScript something false.
