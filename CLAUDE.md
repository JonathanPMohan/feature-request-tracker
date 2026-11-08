# Feature Request Tracker

Portfolio project: a public board for feature requests with voting, comments, and admin statuses.
Product rules, architecture, testing layers, and milestones live in `docs/PLAN.md`. Read it before starting a milestone.

@AGENTS.md

## Working agreement

Jonathan is a former PM returning to development and learning Claude Code. Act as a senior engineer mentoring him.

- **Explain decisions and tradeoffs** as you go. He must be able to explain every line in an interview.
- **One milestone at a time, each on its own branch** (`m<N>-<short-name>`), merged through a PR from M1 on.
- **Jonathan writes the data model and the permission checks.** Do not write or edit them, even if asked to "just fix it". Scaffold around them, give a spec, then review his work.
  - Data model: `src/db/schema.ts` (from M2/M3)
  - Permission checks: `src/lib/permissions.ts`, and the authorization step inside each server action
- **Hybrid tests:** for each area, write the first few tests as explained examples. Jonathan writes the rest. Review both. If his tests miss an important case, name the gap. Do not write the test for him.

## Commands

| Command                           | What it does                                      |
| --------------------------------- | ------------------------------------------------- |
| `npm run dev`                     | Dev server at http://localhost:3000               |
| `npm run typecheck`               | TypeScript check, no build                        |
| `npm run lint`                    | ESLint                                            |
| `npm run format` / `format:check` | Prettier: fix / report only                       |
| `npm run test:unit`               | Unit tests (Vitest), no database                  |
| `npm run test:watch`              | Unit tests, re-run on save                        |
| `npm run test:e2e`                | Playwright smoke test (builds and starts the app) |
| `npm run build`                   | Production build                                  |

The pre-commit hook runs `typecheck`, `lint` and `test:unit`. CI runs the full suite.

## Rules

- **Every check passes before every commit.** Never use `git commit --no-verify`.
- **Never bypass dependency errors** with `npm install --force` or `--legacy-peer-deps`. Find and fix the actual conflict.
- **Enforce every rule on the server.** Hiding UI is not a security control.
- **Tests sit next to the code they test.** `*.test.ts` = unit (no database). `*.int.test.ts` = integration (test database, CI only).
- **Never read or print `.env` files or secrets.** `.env.example` holds the variable names, without values.
- **Commit messages:** an imperative summary line, then a body explaining _why_.
