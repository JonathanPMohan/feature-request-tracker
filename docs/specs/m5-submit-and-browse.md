# Spec: submit and browse (M5)

**Owner:** Claude writes the pages, queries, validation, the rate-limit helper and all tests. Jonathan writes the permission check and the authorization step inside the submit action (🧑 below), and makes the two product decisions at the end.

M5 is the first app code on top of the M4 tables. After it, anyone can browse the board, and signed-in users can submit requests.

## Rules

Each rule is tested. **Server** means it must hold even when someone skips the UI and sends the POST themselves: a server action is a public endpoint, and the Next.js docs say to check authentication and authorization inside every one.

### Browsing (anyone, signed in or not)

| #   | Rule                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1  | The home page lists requests with title, status, vote count and age. No sign-in needed.                                                                                                                                                                                                          |
| S2  | Sorted by votes (highest first), then newest first, then id. The query is the M4 reference query (`data-model.int.test.ts`), so ties never shuffle between pages.                                                                                                                                |
| S3  | 20 per page, chosen with `?page=N`. A bad value (`0`, `-1`, `abc`, `2&page=5`) means page 1 (`parsePageParam` already does this). A page past the end shows an empty state with a link to page 1.                                                                                                |
| S4  | Filter with `?status=planned`. An unknown status is ignored, not an error. Changing the filter goes back to page 1; page links keep the filter.                                                                                                                                                  |
| S5  | `/requests/<id>` shows one request: title, description (line breaks kept), status, vote count, author name, date. Any id that isn't an existing request is a 404, including `abc`, `0`, and `99999999999` (too big for Postgres `integer`: without a check, that's a database error, not a 404). |
| S6  | **Server:** no page ever includes an author's email. Text is rendered as text, never as HTML.                                                                                                                                                                                                    |

### Submitting (signed in)

| #   | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S7  | `/requests/new` sends a visitor to `/sign-in`. **Server:** the submit action refuses a visitor even when called directly, and saves nothing.                                                                                                                                                                                                                                                                                                           |
| S8  | **Server:** input is validated in the action (Zod). Surrounding whitespace is trimmed and `\r\n` becomes `\n` (browsers send textarea line breaks as `\r\n`, which would count double against the limit). Title 1–120, description 1–5,000, counted the way Postgres counts (an emoji is 1, not 2 as in JavaScript's `.length`). Text with no visible character, including the zero-width and non-breaking spaces M4's check lets through, is refused. |
| S9  | Errors show next to the field, and the form keeps what the user typed. (React 19 resets a form after its action runs, so the values come back from the action's state.)                                                                                                                                                                                                                                                                                |
| S10 | **Server:** the request and the author's vote are saved in one transaction, so a new request starts at 1 vote. If either insert fails, neither is saved.                                                                                                                                                                                                                                                                                               |
| S11 | After a successful submit, the user lands on the new request's page, and the home page shows it straight away (no stale list).                                                                                                                                                                                                                                                                                                                         |

### Rate limit (per user, PLAN.md)

| #   | Rule                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S12 | **Server:** 10 submits per user per hour. The 11th is refused with a message and saves nothing.                                                                                                                                |
| S13 | **Server:** the check and the increment are one SQL statement, so 15 submits sent at the same moment let exactly 10 through. (M4 review, finding 5.)                                                                           |
| S14 | A refused attempt doesn't use up quota. Neither does invalid input or a visitor's attempt, because the action checks those first (S15).                                                                                        |
| S15 | The action runs its steps in PLAN.md's order: **who is this → is the input valid → are they allowed → under the limit → save.**                                                                                                |
| S16 | Limits are per user and per action: one user hitting the limit doesn't affect another, and submits don't use up votes. When the hour is over, the count starts again. The demo account shares one limit (accepted in PLAN.md). |

## Who writes what

| File                                      | What                                                                     | Who                 |
| ----------------------------------------- | ------------------------------------------------------------------------ | ------------------- |
| `src/lib/permissions.ts`                  | `canSubmitRequest(user)`                                                 | 🧑 Jonathan         |
| `src/app/requests/new/actions.ts`         | The action, with a marked slot for the authorization step (S7, S12, S15) | Claude, 🧑 the slot |
| `src/lib/rate-limit.ts`                   | `consumeRateLimit(userId, action)` on your `action_rate_limit` table     | Claude              |
| `src/lib/request-input.ts`                | The Zod schema (S8)                                                      | Claude              |
| `src/lib/requests.ts`                     | `listRequests`, `getRequest`, `createRequestWithVote`                    | Claude              |
| `src/app/page.tsx`, `src/app/requests/**` | Home list, detail page, submit page and form                             | Claude              |
| Tests (below)                             | All of them                                                              | Claude              |

**Order of work, as in M3 step 6:** I write everything first, with your function and slot throwing `Not implemented yet`, so the tests that need them fail. You fill them in until those tests pass.

### 🧑 Your two pieces

**1. `canSubmitRequest`** in `src/lib/permissions.ts`:

```ts
export function canSubmitRequest(user: CurrentUser | null): boolean;
```

| Who              | Result                                    |
| ---------------- | ----------------------------------------- |
| Visitor (`null`) | `false`                                   |
| Signed-in user   | `true`                                    |
| Admin            | `true`                                    |
| Demo account     | `true` (reviewers need to try submitting) |

It looks trivial, and that's the point: the rule lives in one place, and M6 and M7 add their own checks beside it.

**2. The authorization step** in `submitRequest` (`src/app/requests/new/actions.ts`). The action has the five S15 steps as numbered comments. Steps 2 (validate) and 5 (save) are written. You write the other three:

1. **Who is this:** read the user with `getCurrentUser()` (`src/lib/session.ts`).
2. _(validate: written)_
3. **Are they allowed:** return the "sign in" error if `canSubmitRequest` says no.
4. **Under the limit:** call `consumeRateLimit(user.id, "submit")`, and return its message if it refuses.
5. _(save: written)_

The returned error shapes are in the file. **Why this order:** only step 4 has a side effect (it counts), so it goes after every step that can refuse. Otherwise a typo in the title, or a visitor's POST, would use up quota (S14).

## The rate-limit helper (Claude)

```ts
type Action = "submit" | "vote" | "comment";
consumeRateLimit(userId: string, action: Action):
  Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }>;
```

The limits (10/hour, 60/minute, 20 per 10 minutes) live in one constant. The core is one `INSERT … ON CONFLICT (user_id, action) DO UPDATE` that:

- starts a new window (count 1) if there's no row, or the old window has ended,
- otherwise adds 1, but **only if** the count is under the limit (a `WHERE` on the update),
- returns no row when refused.

Postgres locks the row during the update, so two simultaneous calls can't both read 9 and both write 10. That's the difference from "read, check in JavaScript, then write", which is the bug S13 tests for.

## Tests (Claude)

| File                                       | Type        | Covers                                                                                                                                                   |
| ------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/permissions.test.ts`              | unit        | `canSubmitRequest`: the four rows above                                                                                                                  |
| `src/lib/request-input.test.ts`            | unit        | S8: trimming, `\r\n`, emoji counting, both sides of every limit, invisible characters                                                                    |
| `src/lib/rate-limit.int.test.ts`           | integration | S12–S16: the 10th allowed and 11th refused, 15 at once → exactly 10, the window resetting, per user, per action                                          |
| `src/lib/requests.int.test.ts`             | integration | S2–S5, S10: list, filter and paging, `getRequest` with odd ids, the transaction rolling back when the vote insert fails                                  |
| `src/app/requests/new/actions.int.test.ts` | integration | S7, S12, S14, S15 through the real action, with the session faked: a visitor saves nothing and uses no quota; invalid input uses no quota                |
| `e2e/requests.spec.ts`                     | end to end  | Browse signed out; submit and land on the new request with 1 vote; the request on the home page; field errors keep typed text; a visitor sent to sign-in |

**On deployed runs,** the submit tests are skipped: they'd add requests to the preview database and use the shared demo account's quota. The browse tests run everywhere.

## 🧑 Product decisions

Write a sentence for each under "Jonathan's decisions" at the end.

### A. What the home page shows with no filter

| Option                                       | For                                        | Against                                               |
| -------------------------------------------- | ------------------------------------------ | ----------------------------------------------------- |
| **All statuses**                             | Simple; nothing hidden                     | Shipped and declined requests crowd the top over time |
| **Active only** (open, planned, in progress) | The board shows what's still being decided | Shipped and declined need a click to find             |

### B. What a rate-limited user is told

| Option                                     | For                   | Against                                                            |
| ------------------------------------------ | --------------------- | ------------------------------------------------------------------ |
| **"Try again in N minutes"**               | Honest and actionable | Tells a spammer exactly when to come back (they'd find out anyway) |
| **A generic "You're submitting too fast"** | Reveals nothing       | A real user doesn't know how long to wait                          |

## Out of scope

Voting from the list (M6), comments (M7), admin status changes and deletes (M8), text search (not in v1), and sample data on the production board.

## Jonathan's decisions

_(A and B: one or two sentences each.)_
