# Feature Request Tracker — Plan

A public board where people submit feature requests, vote on them, and comment, and admins mark what's planned, in progress, shipped, or declined.

Two goals: a portfolio project whose every line I can explain, and hands-on practice with Claude Code.

_Last updated: 2026-11-06_

---

## Product rules (v1)

**Access**

- Anyone can browse requests, vote counts, comments, and statuses without signing in.
- Submitting, voting, and commenting require sign-in.
- Every rule is enforced **on the server**. Hiding a button is a convenience, not a security control.

**Accounts**

- Sign up and sign in with email + password. No email verification or password reset in v1.
- Every user has a role: `user` (default) or `admin`.
- Admins are promoted with a script (`npm run make-admin <email>`). There is no admin UI.
- A **demo account** is shown on the sign-in page so reviewers can try the app.
- **The demo account can never be an admin.** Both the script and the database itself must refuse it, and tests prove both.

**Requests**

- Title and description. One public board.
- Statuses: `open` (default) → `planned` → `in progress` → `shipped`, plus `declined`. Only admins change status.
- Submitting a request automatically counts as the author's vote, so new requests start at 1.
- No editing or user deletion in v1. Admins can delete any request or comment.

**Votes**

- One vote per user per request, enforced by the database, not only the app.
- Voting is a toggle: users can take a vote back.

**Browsing**

- Sorted by votes (highest first). Ties go to the newest request, so the order never shuffles between page loads.
- 20 per page with page numbers.
- Filter by status. No text search in v1.

**Rate limiting**

| Action         | Limited by | Starting limit    |
| -------------- | ---------- | ----------------- |
| Sign-up        | IP address | 5 per hour        |
| Submit request | user       | 10 per hour       |
| Vote / unvote  | user       | 60 per minute     |
| Comment        | user       | 20 per 10 minutes |

- Limits are stored in **Postgres**, not in server memory. Vercel runs the app on many short-lived servers, so a counter in memory would reset constantly and wouldn't be shared between them.
- Sign-up uses Better Auth's built-in rate limiting, configured to store its counts in the database.
- Requests, votes and comments use a small rate-limit helper. Each server action calls it next to its permission checks.
- The demo account is shared by everyone, so it shares one set of limits. This is accepted: abuse only slows down the demo.
- The starting limits are guesses. They get tuned after real use.

---

## Architecture

```
Browser
   │
   ▼
Next.js app (Vercel)
   ├─ Pages (server components) ── read data and render HTML on the server
   ├─ Server actions ───────────── handle every write
   │     each one: 1. who is this?         → Better Auth session
   │               2. are they allowed?    → permission checks (lib/permissions)
   │               3. is the input valid?  → Zod schema
   │               4. under the rate limit? → rate-limit helper
   │               5. do it                → Drizzle query / transaction
   ├─ lib/permissions ──────────── all permission rules, as small pure functions
   └─ db/schema ────────────────── the data model
   │
   ▼
PostgreSQL ── Neon (production) · Docker (dev + test)
```

The order matters. Checking permission before validation means a visitor is told to sign in, not to fix a form they can't submit (changed in M5, after `/code-review`). The rate limit comes last because it's the only step with a side effect: it uses up quota, so nothing that can still refuse may run after it.

| Layer      | Choice                                                | Why                                                          |
| ---------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| Framework  | Next.js 16 (App Router), React 19                     | One app for UI and server code; widely used                  |
| Language   | TypeScript, strict                                    | Type errors are caught before the code runs                  |
| Database   | PostgreSQL                                            | Relational data with rules the database can enforce          |
| DB library | Drizzle + drizzle-kit migrations                      | Reads close to SQL, so the data model stays visible          |
| Auth       | Better Auth (email + password)                        | Proven password hashing and sessions; explained step by step |
| Validation | Zod                                                   | One schema checks input and supplies its TypeScript type     |
| Styling    | Tailwind CSS, no component library                    | Simple and accessible; all code is written in this project   |
| Tests      | Vitest (unit, integration), Playwright (end to end)   | See below                                                    |
| CI/CD      | GitHub Actions → Vercel; Neon for production Postgres | A preview URL for every PR; merging to `main` deploys        |

**Who writes what:** I (Jonathan) write the **data model** and the **permission checks**. Claude scaffolds around them, writes the tests, and reviews my work.

---

## Testing

| Layer                             | What it covers                                    | Database?      | Runs in pre-commit hook | Runs in CI |
| --------------------------------- | ------------------------------------------------- | -------------- | ----------------------- | ---------- |
| **Unit** (`*.test.ts`)            | Permission functions, validation, small helpers   | No             | ✅                      | ✅         |
| **Integration** (`*.int.test.ts`) | Server actions, database constraints, rate limits | Docker test DB | ❌                      | ✅         |
| **End to end** (`e2e/`)           | Main user paths in a real browser                 | Yes            | ❌                      | ✅         |

- **The pre-commit hook** runs type checks, lint and unit tests only. It must stay fast: a few seconds, with no Docker needed.
- **CI** runs the full suite on every PR. Branch protection blocks merging until it passes.
- **Who writes tests:** Claude writes them as working, commented examples, and I study them (changed in M3: I learn best from working code). If I write some myself, Claude reviews them and names any missing case.

---

## Milestones

Each milestone gets its own branch and PR, with checks passing before every commit. One milestone is roughly one week at 8–10 hours.
🧑 = work I write; Claude writes the tests and reviews.

### First shareable version: M0–M6

After M6, the app is live, and people can sign up, submit, browse and vote, with rate limiting on. This is the version to share.
Known gap until M8: there's no admin UI to delete spam. Until then, spam is removed directly in the database.

| #       | Milestone                   | Scope                                                                                                                                                                                                                                                                                       | Claude Code skill                                     |
| ------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **M0**  | Project setup               | git refresher; Next.js scaffold; TypeScript strict; ESLint + Prettier; Vitest with a first unit test; **git pre-commit hook** (type checks, lint, unit tests); `CLAUDE.md`; this plan                                                                                                       | `CLAUDE.md`, permission settings                      |
| **M1**  | GitHub, CI, first deploy    | Public repo; GitHub Actions CI; protected `main`; app live on Vercel with PR previews; **one Playwright smoke test** that runs in CI against a production build _and_ against each successful Vercel deployment (preview and production, triggered by Vercel's `repository_dispatch` event) | Drafting commits and PRs, `/code-review`              |
| **M2**  | Database foundation         | Docker Compose Postgres; dev + test databases; Drizzle; migration workflow; Neon connected; decide when migrations run in production; integration-test setup added to CI                                                                                                                    | Claude Code hooks, and how they differ from git hooks |
| **M3**  | Auth                        | Better Auth sign up / in / out, explained step by step; sign-up rate limit; 🧑 `role` on the user table; 🧑 the database refuses a demo admin; `make-admin` script (refuses the demo account); demo account seed; tests that passwords are hashed and sessions expire                       | Plan mode                                             |
| **M4**  | 🧑 Data model               | 🧑 requests, votes, comments and rate-limit tables; constraints; what deleting does; how votes are counted. Claude writes the example constraint tests, then reviews                                                                                                                        | Reviewing my own code with Claude                     |
| **M5**  | Submit and browse           | Submit (request and first vote saved together in a transaction); list sorted by votes then newest; 20 per page; status filter; detail page; rate-limit helper with example tests; 🧑 permission checks and rate-limit calls                                                                 | Writing and reviewing tests with Claude               |
| **M6**  | Voting                      | Vote toggle, safe against double-clicks; 🧑 permission checks and rate limit; a walkthrough of a signed-out vote sent from the command line being rejected. **→ First shareable version**                                                                                                   | Debugging with Claude                                 |
| **M7**  | Comments                    | Add and view comments; 🧑 permission checks and rate limit                                                                                                                                                                                                                                  | —                                                     |
| **M8**  | Admin                       | Set status; delete requests and comments; 🧑 permission checks and admin tests                                                                                                                                                                                                              | `/security-review`                                    |
| **M9**  | End-to-end tests and launch | Playwright tests for the main paths; README with screenshots and architecture (the demo account went live in M3)                                                                                                                                                                            | Polishing a portfolio repo                            |
| **M10** | _Optional polish_           | Empty states, loading states, error states, a more refined look (aimed at product-focused roles)                                                                                                                                                                                            | —                                                     |

### Later (v2 ideas)

Sign in with GitHub · editing requests and comments · email verification and password reset · multiple boards (a migration exercise) · text search.
