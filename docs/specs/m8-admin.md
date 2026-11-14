# Spec: admin (M8)

**Owner:** Jonathan writes the admin permission checks and each admin action's authorization steps (🧑 below), fixes issue #14 in his vote action, and makes the decisions at the end. Claude writes the controls, the queries and the tests, then reviews. M8's skill is **`/security-review`**: Jonathan runs it on the finished branch, and we go through its findings together.

PLAN.md: "Only admins change status. Admins can delete any request or comment." Admins are made with `npm run make-admin` (M3); there's still no UI for roles. Until now, spam could only be removed in the database.

## Rules

Each rule is tested. **Server** means it holds even when someone skips the UI and sends the POST themselves. M6's walkthrough showed why every one of these matters.

| #   | Rule                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | On a request's page, an admin sees a status control, a "Delete request" button, and a "Delete" button on each comment. Nobody else sees them.                                                                   |
| A2  | **Server:** only an admin can change a status or delete anything. A user, the demo account or a visitor is refused, even sending the POST directly, and nothing changes.                                        |
| A3  | **Server:** a status is one of the five, checked in the action before the database's CHECK (M4) refuses it with an error.                                                                                       |
| A4  | **Server:** deleting a request deletes its votes and comments (M4, D6: the cascade). The admin lands on the board afterwards.                                                                                   |
| A5  | **Server:** deleting a comment deletes that comment only.                                                                                                                                                       |
| A6  | Deleting asks for confirmation first. Deleting can't be undone.                                                                                                                                                 |
| A7  | **Server:** a request or comment that doesn't exist, or can't, is refused with a message, never a crash. Deleting something already deleted (two admins, or a double-click) says so, and isn't an error.        |
| A8  | **Server, issue #14:** a vote and a status change at the same moment can't leave a vote on a decided request. Either the vote lands while the request is still active, or it's refused because it no longer is. |
| A9  | **Server:** a demoted admin loses admin rights on their very next request. (True already: Better Auth's cookie cache is off by default, so every session read gets the role from the database. Tested anyway.)  |
| A10 | **Server:** the action's steps run in PLAN.md's order: who is this → are they allowed → is the input valid → save. No rate limit step: see "Not rate-limited" below.                                            |

### Not rate-limited

PLAN.md's limits are for users: submit, vote, comment. Admin actions have no limit, on purpose: admins are a handful of trusted people made by a script, and a limit could stop an admin cleaning up a spam wave. If an admin account were taken over, a rate limit wouldn't be the protection that matters; keeping admin accounts few and their passwords strong would. Write a sentence in your decisions if you disagree.

## Issue #14: the vote and status race

Today the vote action checks the status (`findRequest`, then `canVote`) and writes the vote in separate statements. Once admins can change status, this can happen:

1. A vote reads the status: `open`. `canVote` says yes.
2. An admin sets the request to `shipped`.
3. The vote is written anyway, onto a decided request. Decision A from M6 says those votes are frozen.

**The fix: check and write in one transaction, with the request's row locked.**

```sql
BEGIN;
SELECT status FROM feature_request WHERE id = $1 FOR SHARE;  -- lock the row
-- canVote(user, request), in TypeScript
INSERT … / DELETE …;                                          -- the vote
COMMIT;                                                        -- unlocks
```

`FOR SHARE` lets many votes hold the lock together, so votes don't wait for each other. But changing the status is an `UPDATE`, whose row lock conflicts with `FOR SHARE`: the status can't change while any vote holds the lock, and a vote that locks the row after the update sees the new status. Either way, a vote never writes against a status that's no longer true.

Claude provides `withRequestLocked(requestId, fn)` in `src/lib/requests.ts`: it opens the transaction, locks the row, and calls `fn` with the request (or `null` if it doesn't exist) and the transaction to write with. **🧑 You move your step 2b and 2c into it.** That's the change to your vote action. The test runs a vote and a status change at the same moment, many times, and checks that no vote is ever on a shipped request.

## Who writes what

| File                                         | What                                                                                                 | Who                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------- |
| `src/lib/permissions.ts`                     | The admin checks (decision C)                                                                        | 🧑 Jonathan          |
| `src/app/requests/[id]/admin-actions.ts`     | `setStatusAction`, `deleteRequestAction`, `deleteCommentAction`, with marked slots for steps 1 and 2 | Claude, 🧑 the slots |
| `src/app/requests/vote-action.ts`            | Steps 2b and 2c inside `withRequestLocked` (#14)                                                     | 🧑 Jonathan          |
| `src/lib/requests.ts`, `src/lib/comments.ts` | `withRequestLocked`, `setStatus`, `deleteRequest`, `deleteComment`, `findComment`                    | Claude               |
| `src/app/requests/[id]/admin-controls.tsx`   | The status control and delete buttons, with confirmation                                             | Claude               |
| Tests                                        | Decision D                                                                                           | Claude, or 🧑        |

As before: Claude writes everything first, with your parts throwing `Not implemented yet`, so the tests that need them fail until you fill them in.

## Tests

| File                                              | Type        | Covers                                                                                                                                               |
| ------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/permissions.test.ts`                     | unit        | The admin checks: visitor, user, demo, admin                                                                                                         |
| `src/lib/requests.int.test.ts`, `comments.int…`   | integration | `setStatus`, the deletes and their cascade, `withRequestLocked`                                                                                      |
| `src/app/requests/[id]/admin-actions.int.test.ts` | integration | A2, A3, A7, A9 through the real actions: everyone but an admin is refused and nothing changes; odd ids and statuses; deleting twice; a demoted admin |
| `src/app/requests/vote-action.int.test.ts`        | integration | A8 (#14): votes and status changes at the same moment never leave a vote on a decided request                                                        |
| `e2e/admin.spec.ts`                               | end to end  | An admin changes a status and sees the votes freeze; deletes a comment; deletes a request and lands on the board; a user sees none of the controls   |

**On deployed runs,** all admin tests are skipped: they need an admin account, and no test should make one on a real deployment.

## 🧑 Decisions

Write a sentence for each under "Jonathan's decisions" at the end.

### A. Which status changes are allowed?

PLAN.md draws a path: `open` → `planned` → `in progress` → `shipped`, plus `declined`.

| Option                  | For                                                                        | Against                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Any to any**          | Simple. An admin can fix a mistake (shipped by accident → back to planned) | Nothing stops odd jumps (open → shipped is fine, but declined → in progress?)                                             |
| **Only along the path** | The board tells a consistent story                                         | Fixing a mistake needs an escape hatch, and the rules need their own tests. More to build for a handful of trusted admins |

If you choose "any to any": what happens to frozen votes when a request goes from `shipped` back to `planned`? (With M6's rule, voting simply opens again. Nothing is lost, because frozen votes were never deleted.)

### B. Does #14 matter enough to fix now?

It only happens if a vote and a status change land within milliseconds of each other. The cost of the bug: a single vote on a decided request. The cost of the fix: a transaction and a lock on every vote.

I'd fix it. M6's decision A promised frozen votes, and M5 and M7 taught the same lesson: a check and a write that aren't atomic will eventually race. Fixing it is also the clearest example in the project of a lock, worth having in an interview. But it's your call; if you defer it, say why and leave #14 open.

### C. One admin check, or one per action?

| Option                                                                        | For                                                                                                                                                       | Against                                                                                 |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **One:** `isAdmin(user)`                                                      | Short; every admin action asks the same question today                                                                                                    | Every action now depends on "admin", so changing who can do one action changes them all |
| **One per action:** `canChangeStatus`, `canDeleteRequest`, `canDeleteComment` | Each answers "may this user do this?", like `canVote` and `canComment`. If authors may one day delete their own comments, only `canDeleteComment` changes | Three functions that look the same today                                                |

### D. Who writes the admin action tests?

PLAN.md's M8 row says "🧑 admin tests". Since M3, Claude writes the tests and you study them. M8 is a good place to switch for one file: you've read three action test files, and `admin-actions.int.test.ts` follows the same pattern.

| Option                                                                               | For                                                                                    | Against                                                  |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Claude writes them all**, as in M3 to M7                                           | Faster                                                                                 | You read tests, but don't practice writing them          |
| **You write `admin-actions.int.test.ts`**, Claude reviews it and names missing cases | Practice writing tests, with the rules above as your list; an interview may ask you to | Slower, and it's the part of M8 that needs the most care |

## Then: `/security-review`

When everything passes, run **`/security-review`** in Claude Code. It looks for security problems in the branch's changes: missing authorization, injection, data exposure. Admin actions are where a missed check matters most, so it's the right milestone for it. We'll go through its findings together, like `/code-review` in M4 to M7.

## Out of scope

A UI for making admins (the script stays), an audit log of who changed what, editing requests or comments, restoring deleted content, and rate limits for admin actions.

## Jonathan's decisions

_(A to D: what you chose, and one sentence on why.)_
