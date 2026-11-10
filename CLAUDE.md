# Feature Request Tracker

Portfolio project: a public board for feature requests with voting, comments, and admin statuses.
Product rules, architecture, testing layers, and milestones live in `docs/PLAN.md`. Read it before starting a milestone.

@AGENTS.md

## Working agreement

Jonathan is a former PM returning to development and learning Claude Code. Act as a senior engineer mentoring him.

- **Explain decisions and tradeoffs** as you go. He must be able to explain every line in an interview.
- **One milestone at a time, each on its own branch** (`m<N>-<short-name>`), merged through a PR from M1 on.
- **Jonathan writes the data model and the permission checks.** Do not write or edit them, even if asked to "just fix it". Scaffold around them, give a spec, then review his work.
  - Data model: `src/db/schema.ts`, the `user.additionalFields` in `src/lib/auth-options.ts`, and hand-written (`--custom`) SQL migrations in `drizzle/`. `src/db/auth-schema.ts` is generated (`npm run auth:generate`), so never edit it by hand.
  - Permission checks: `src/lib/permissions.ts`, and the authorization step inside each server action
- **Hybrid tests:** for each area, write the first few tests as explained examples. Jonathan writes the rest. Review both. If his tests miss an important case, name the gap. Do not write the test for him.

## Commands

| Command                           | What it does                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `npm run dev`                     | Dev server at http://localhost:3000                                           |
| `npm run typecheck`               | TypeScript check, no build                                                    |
| `npm run lint`                    | ESLint                                                                        |
| `npm run format` / `format:check` | Prettier: fix / report only                                                   |
| `npm run test:unit`               | Unit tests (Vitest), no database                                              |
| `npm run test:integration`        | Integration tests (Vitest) against `TEST_DATABASE_URL` (needs local Postgres) |
| `npm run test:watch`              | Unit tests, re-run on save                                                    |
| `npm run test:e2e`                | Playwright smoke test (builds and starts the app)                             |
| `npm run db:generate`             | Write a SQL migration from changes to `src/db/schema.ts`                      |
| `npm run db:migrate`              | Apply pending migrations to `DATABASE_URL`                                    |
| `npm run db:studio`               | Browse the database in a web UI                                               |
| `npm run build`                   | Production build                                                              |

The pre-commit hook runs `typecheck`, `lint` and `test:unit`. CI runs the full suite.

## Local database

Postgres 18 in Docker (`docker-compose.yml`): `feature_requests_dev` and `feature_requests_test` on `127.0.0.1:5432`, user and password `postgres`. See `docs/LOCAL_DEVELOPMENT.md`.

- **Do not run streaming Docker commands from your shell.** That means `docker run`, `docker compose up`, `logs -f` and `events`. They hang there, even though they work in Jonathan's Terminal.
- **Ask Jonathan to run them instead,** then verify by connecting to the database directly (e.g. `nc -z 127.0.0.1 5432`, or a Node `pg` query).

## Rules

- **Every check passes before every commit.** Never use `git commit --no-verify`.
- **Never bypass dependency errors** with `npm install --force` or `--legacy-peer-deps`. Find and fix the actual conflict.
- **Enforce every rule on the server.** Hiding UI is not a security control.
- **Tests sit next to the code they test.** `*.test.ts` = unit (no database). `*.int.test.ts` = integration (test database). Integration tests wipe every table before each test, and refuse to run unless the database name ends in `_test`.
- **Pages you leave stay in the DOM, hidden** (`cacheComponents` keeps them for instant "back"). In Playwright, find elements inside `page.getByRole("main")` or with `getByRole`, never a bare `getByLabel`/`locator`, or tests match the hidden page and time out. Forms reset themselves after a successful submit.
- **Better Auth rate-limits sign-in and sign-up in production builds**, including `npm run test:e2e` (3 per 10 seconds per IP, in memory). The e2e suite fits within that; adding more auth tests may not.
- **Never read or print `.env` files or secrets.** `.env.example` holds the variable names, without values. Enforced by a PreToolUse hook (`.claude/hooks/block-env-files.mjs`) for Bash and all file tools.
  - It matches the text of Bash commands, so any command that merely _mentions_ a dotenv file name is blocked too, including a heredoc or a `git commit -m` message.
  - Workaround: change files with the Edit/Write tools (only their paths are checked), and write commit messages to a scratch file, then `git commit -F <file>`.
- **Commit messages:** an imperative summary line, then a body explaining _why_.
