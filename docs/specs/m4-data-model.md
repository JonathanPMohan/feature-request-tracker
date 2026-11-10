# Spec: the data model (M4)

**Owner:** Jonathan designs and writes the schema and migrations. Claude writes the tests and reviews.

M5 to M8 build on these tables: submit and browse, voting, comments, admin. A good model here makes those milestones simple. A weak one makes every one of them work around it.

## Rules your design must satisfy

Tested in `src/db/data-model.int.test.ts`. Rules marked **database** must hold even if the app has a bug.

| #   | Rule                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Every request has a title, description, author, status, and creation time. None of them is ever null.                                                                                   |
| D2  | **Database:** status is exactly one of `open`, `planned`, `in_progress`, `shipped`, `declined`. A new request is `open`.                                                                |
| D3  | **Database:** text has visible content and a maximum length. A title is 1 to 120 characters, a description is 1 to 5,000, a comment is 1 to 2,000. All spaces doesn't count as content. |
| D4  | **Database:** every request, vote and comment belongs to a user and a request that exist.                                                                                               |
| D5  | **Database:** one vote per user per request.                                                                                                                                            |
| D6  | **Database:** deleting a request deletes its votes and comments (admins delete spam in M8).                                                                                             |
| D7  | **Database:** deleting a user deletes their votes. A deleted person's vote shouldn't keep counting.                                                                                     |
| D8  | Every timestamp is `timestamp with time zone` (`timestamptz`), defaults to the current time, and is never null. (Why: CLAUDE.md, from M3 step 7.)                                       |
| D9  | The home page query stays fast: requests filtered by status, sorted by vote count (highest first), then newest first, 20 per page. Reviewed, not tested.                                |

**Not a database rule:** "submitting a request counts as the author's vote" (PLAN.md). M5 saves the request and that vote together in one transaction.

## Names the tests rely on

The tests use raw SQL, so they work with whatever Drizzle code you write, as long as these names exist. Everything else (types, keys, extra columns, indexes) is yours.

| Table             | Columns the tests use                                             |
| ----------------- | ----------------------------------------------------------------- |
| `feature_request` | `id`, `title`, `description`, `status`, `author_id`, `created_at` |
| `vote`            | `user_id`, `request_id`, `created_at`                             |
| `comment`         | `id`, `request_id`, `author_id`, `body`, `created_at`             |

`request` alone would work in Postgres, but it reads like an HTTP request everywhere in the code, so it's `feature_request`.

The **rate-limit table** (decision E) is named by you. Its tests come in M5, with the helper that uses it.

## Decisions (yours)

Write a short note for each in this file, under "Jonathan's decisions" at the end. Reviewers (and interviewers) ask why.

### A. Request and comment IDs

| Option                                                | Pros                                              | Cons                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Identity integer** (`generated always as identity`) | Short URLs (`/requests/42`), small, fast, ordered | Reveals how many requests exist, and IDs are guessable (does that matter on a public board?) |
| **UUID** (`uuid default gen_random_uuid()`)           | Not guessable, can be created anywhere            | Long URLs; bigger indexes                                                                    |
| **Text, like Better Auth's IDs**                      | Matches `user.id`                                 | You'd have to generate them yourself                                                         |

### B. How vote counts are counted

The home page sorts by vote count, so this decides how that query works.

| Option                                                             | Pros                                                                    | Cons                                                                                                             |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Count on read** (`count(*)` from `vote`, grouped by request)     | Always correct: there's nothing to keep in sync                         | Every page load counts votes. Fine at this size with the right index; slower at millions of votes                |
| **A stored `vote_count` on `feature_request`, updated by the app** | Sorting is a plain indexed column                                       | Every code path that adds or removes a vote must update it, in the same transaction. A missed one drifts forever |
| **A stored count, updated by a database trigger**                  | Fast sorting, and the database keeps it correct even if the app forgets | Triggers are hidden logic: harder to see, test and explain                                                       |

### C. What happens to a deleted user's requests and comments

D7 already says their votes go. Users can't delete themselves in v1 (that endpoint is off), so this is about an admin removing a spammer or honoring a deletion request.

| Option                              | Effect                                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Cascade**                         | Their requests and comments are deleted, along with everyone else's votes and comments on those requests |
| **Set null** (author becomes empty) | The content stays and shows as "deleted user". But D1 says author is never null, so you'd revisit D1     |
| **Restrict**                        | The database refuses to delete a user who has content. Someone must decide about the content first       |

### D. Status storage

The same choice as `role` in M3: a Postgres enum, or `text` plus a CHECK. Consider whether consistency with `role` matters to you, and that M8's admin UI may add a status someday.

### E. The rate-limit table for requests, votes and comments

PLAN.md: submit 10/hour, vote 60/minute, comment 20 per 10 minutes, per user, stored in Postgres. M5's helper is built on this table.

| Option                                                                                                       | Pros                                               | Cons                                                                  |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | --------------------------------------------------------------------- |
| **An event log**: one row per action (`user_id`, `action`, `created_at`); count rows in the window           | Exact sliding windows; easy to understand and test | Grows forever unless old rows are deleted                             |
| **Counters**: one row per user and action, with a count and a window start (like Better Auth's `rate_limit`) | Small; one row per user and action                 | Fixed windows allow bursts at the edges; the increment must be atomic |

### F. Indexes

Postgres indexes primary keys and unique constraints automatically, but **not foreign keys**. Work out which queries M5 to M8 will run (D9, a request's comments, "has this user voted?", deleting a request) and which need an index.

## Where your code goes

1. **Tables** in `src/db/schema.ts` (Drizzle). Reference the user table from `src/db/auth-schema.ts`, and don't edit that file.
2. **Generate the migration:** `npm run db:generate -- --name <name>`. Read the SQL it writes.
3. **Anything Drizzle can't express**, such as a trigger (option B3), goes in a hand-written migration: `npm run db:generate -- --custom --name <name>`.
4. **Apply:** `npm run db:migrate`. The integration tests migrate the test database themselves.

## Then: review your own code with Claude Code

When the tests pass, before asking me to review, run **`/code-review`** in Claude Code. It reviews the uncommitted changes on your branch for bugs. It's the skill this milestone teaches, and it's how you'd check your own work before opening a PR in a team.

## Jonathan's decisions

_(A to F: one or two sentences each on what you chose and why.)_
