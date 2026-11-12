# Spec: voting (M6)

**Owner:** Claude writes the vote button, the action's other steps, the queries and all tests. Jonathan writes the permission check and the action's authorization steps (🧑 below), and makes the two product decisions at the end. Then Jonathan runs the walkthrough at the end, with Claude, to see a signed-out vote refused from the command line.

**After M6, the app is the first shareable version** (PLAN.md): people can sign up, submit, browse and vote, with rate limits on.

## Rules

Each rule is tested. **Server** means it holds even when someone skips the UI and sends the POST themselves.

| #   | Rule                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V1  | A signed-in user can vote for a request from the board and from its page, and take the vote back the same way (PLAN.md: "voting is a toggle"). Authors can take back their own first vote too, so a request can reach 0. |
| V2  | The button shows whether you've voted, on the board and on the request page. A visitor sees the count, and the button sends them to sign in.                                                                             |
| V3  | **Server:** a visitor's vote is refused, even sent directly. Nothing changes and no quota is used.                                                                                                                       |
| V4  | **Server, safe against double-clicks:** the action is "set my vote to yes/no", not "flip my vote". Two identical clicks leave one vote, never zero and never an error. Many at the same moment: still one vote.          |
| V5  | The count changes the moment you click (an optimistic update), then settles on the server's answer. If the server refuses, it goes back, and the reason shows.                                                           |
| V6  | The board doesn't re-sort under your cursor. Your click changes the count in place; the order updates on the next visit.                                                                                                 |
| V7  | **Server:** 60 vote changes per user per minute (PLAN.md), counted by `consumeRateLimit(user.id, "vote")`. Over the limit: refused with "try again in N minutes", nothing changes.                                       |
| V8  | **Server:** a request id that doesn't exist, or can't (`abc`, `0`, too big for `integer`), is refused with a message, never a crash.                                                                                     |
| V9  | **Server:** the action's steps run in PLAN.md's order: who is this → are they allowed → is the input valid → under the limit → save.                                                                                     |
| V10 | Decisions A and B below hold, on the server.                                                                                                                                                                             |

### Why "set", not "flip" (V4)

A double-click sends two requests before the first answer arrives.

| Each request says        | Two clicks give                                                |
| ------------------------ | -------------------------------------------------------------- |
| **"Flip my vote"**       | vote, then unvote: the user clicked "vote" and ended with none |
| **"Set my vote to yes"** | yes, then yes again: one vote, as intended                     |

The button knows what it shows, so it asks for the opposite of that: "yes" when it shows "not voted". The database does the rest: `INSERT … ON CONFLICT DO NOTHING` to vote, `DELETE` to unvote. Both are safe to repeat. The button is also disabled while a request is in flight, but that's a convenience: the server rule holds without it.

## Who writes what

| File                               | What                                                                    | Who                  |
| ---------------------------------- | ----------------------------------------------------------------------- | -------------------- |
| `src/lib/permissions.ts`           | `canVote(user, request)`                                                | 🧑 Jonathan          |
| `src/app/requests/vote-action.ts`  | `setVote(requestId, voted)`, with marked slots for steps 1, 2 and 4     | Claude, 🧑 the slots |
| `src/lib/votes.ts`                 | `setVote` in the database: insert or delete, then the new count         | Claude               |
| `src/lib/requests.ts`              | The board and request queries also say whether _you_ voted              | Claude               |
| `src/app/requests/vote-button.tsx` | The button: optimistic count, disabled while pending, the error message | Claude               |
| Tests (below)                      | All of them                                                             | Claude               |

As in M5: I write everything first, with your parts throwing `Not implemented yet`, and the tests that need them fail until you fill them in.

### 🧑 Your two pieces

**1. `canVote`** in `src/lib/permissions.ts`:

```ts
export function canVote(
  user: CurrentUser | null,
  request: { status: Status },
): boolean;
```

A plain `boolean`, unlike `canSubmitRequest`'s `user is CurrentUser`. A type predicate also speaks when it returns `false`: it tells TypeScript the user isn't a `CurrentUser`, meaning a visitor. `canVote` refuses signed-in users too (the demo account, a shipped request), so a predicate would make the compiler believe something false. Claude's first draft of this signature had exactly that bug; TypeScript caught it.

It takes the request because of decision A: whether a vote is allowed can depend on the request's status, not only on who's asking. Decision B may make it depend on the user too. Write the rule your decisions describe; the unit tests follow them.

**2. Steps 1, 2 and 4** in `setVote` (`src/app/requests/vote-action.ts`), like M5's action:

1. **Who is this:** `getCurrentUser()`.
2. **Are they allowed:** load the request with the helper provided, `getVoteTarget(requestId)`. It returns `null` for an id that can't exist (`abc`) as well as one that doesn't, so both get the same "not found" refusal (V8). Then refuse a visitor ("sign in"), and anyone `canVote` says no to ("not allowed").
3. _(valid: written. Checks the yes/no value.)_
4. **Under the limit:** `consumeRateLimit(user.id, "vote")`.
5. _(save: written)_

**Changed after `/code-review` (finding 6):** Jonathan moved the visitor check before the lookup. A signed-out POST is told to sign in whatever id it sends, without a database query, and existing and missing ids get the same answer. He also made `canVote` an allow-list (open, planned, in progress), so a status added later can't take votes until someone decides it should: it fails closed.

**A wrinkle worth noticing:** "are they allowed" needs the request, so step 2 reads the database before step 3 validates the input. That's fine, because PLAN.md's order is about one thing: nothing that can still refuse may run after the rate limit, since only the rate limit uses up quota. Reads before it are free.

## Tests (Claude)

| File                                       | Type        | Covers                                                                                                                                                                 |
| ------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/permissions.test.ts`              | unit        | `canVote`: visitor, user, admin, demo, and each status, per decisions A and B                                                                                          |
| `src/lib/votes.int.test.ts`                | integration | V4: voting twice leaves one vote; unvoting twice is fine; 20 "yes" at once → 1 vote; a mix of yes and no at once → 0 or 1, never an error; the count returned is right |
| `src/lib/requests.int.test.ts`             | integration | V2: the board and request queries say whether a given user voted, and say no for a visitor                                                                             |
| `src/app/requests/vote-action.int.test.ts` | integration | V3, V7, V8, V9, V10 through the real action: a visitor changes nothing and uses no quota; odd ids; the 61st change in a minute is refused                              |
| `e2e/voting.spec.ts`                       | end to end  | Vote and unvote on the board and the request page; a fast double-click leaves one vote; the order doesn't jump; a visitor's button goes to sign in                     |

**On deployed runs,** the voting tests are skipped (they create accounts and change counts). The visitor test runs everywhere.

## The walkthrough: a signed-out vote from the command line

PLAN.md's M6 skill is **debugging with Claude**. Once M6 works locally and its tests pass, you'll run this with me in Claude Code:

1. Run the app (`npm run dev`), sign in, open the browser's dev tools → **Network**, and click a vote button.
2. Find the POST it sent. Note the **`Next-Action`** header (the action's ID), and the body.
3. Replay that POST with `curl` **without your session cookie**: a signed-out vote, sent the way an attacker would, with no page involved.
4. Predict what happens, then check: the response, and the `vote` table (it mustn't change).
5. Then, deliberately, break the server: comment out step 2c (the `canVote` check). Sign in as the **demo account** in the browser, whose vote button is disabled, and copy its session cookie into the `curl`. Replay it and watch the vote go through: the UI said no, the server said yes. Put the check back, replay, and see it refused again. That's PLAN.md's "hiding a button is not a security control", on the wire.

   (Why not break the signed-out case? Without a session there's no user to vote as: the code would reach `user.id` on `null` and crash with a 500, not vote. Claude's first draft of this step said otherwise.)

You'll write up what you saw in a short section of this file: what an action really is on the wire, and why the check must live inside it.

## 🧑 Product decisions

Write a sentence for each under "Jonathan's decisions" at the end.

### A. Can people vote on shipped or declined requests?

| Option                                 | For                                                                 | Against                                                                          |
| -------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Only open, planned and in progress** | Votes are a signal for deciding; after a decision they mean nothing | A request someone wants re-opened can't gather support                           |
| **Any status**                         | Simple; a declined request with many votes tells you something      | Votes on shipped items are noise, and the board's sort mixes them in under "All" |

If you choose "only active", what happens to existing votes when a request is shipped? (Kept and frozen is the simple answer: they show what led to the decision.)

### B. Can the demo account vote?

Everyone using the demo shares one account, so it has one vote per request. A reviewer who votes might see the button already "voted" because someone else did, and taking it back removes that person's vote.

| Option                                                           | For                                | Against                                                              |
| ---------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| **Yes, like anyone**                                             | Reviewers can try the main feature | The shared vote is confusing, and demo votes count on the real board |
| **No: it sees the button, but votes are refused with a message** | Real counts stay real              | Reviewers can't try voting without signing up                        |

## Out of scope

Comments (M7), admin status changes (M8), and showing _who_ voted.

## Jonathan's decisions

**A. Voting only on active requests** (open, planned, in progress). Votes on a shipped or declined request are kept and frozen: they show what led to the decision. Why: Once a request is shipped or declined, more votes can’t change the decision, and freezing the count keeps an honest record of the demand behind it.

**B. The demo account can't vote.** It sees the counts, and its vote button is disabled with a note to sign up; the server refuses its votes too. Why: Everyone shares the demo account, so its vote doesn’t represent a real person, and any visitor could add or remove it and skew the counts.

## Walkthrough: What I saw

**What a server action is on the wire.** A server action is an ordinary POST request. The URL is just the page, the `next-action` header tells Next.js which server function to run, and the body holds its arguments, like `[16,true]`. I copied a real vote as a curl command and could send it from the terminal with no page involved, so anyone can call these functions with any arguments.

**Why a refusal still returns 200 OK.** The action ran and returned a value, so the HTTP status is 200. The refusal is in the body: `{"ok":false,"message":"Sign in to vote."}`. Monitoring that only watches status codes would count it as a success.

**Why the disabled button didn't stop the demo account.** With `canVote` commented out, I sent a vote using the demo account's session from curl, and it was saved, even though the demo's button is disabled. The button only affects the page, and a direct request skips the page. With `canVote` restored, the same request was refused before the rate limit, so no quota was used. Authorization has to happen on the server, in every action.
