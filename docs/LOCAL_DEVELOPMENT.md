# Local development

## Requirements

- Node.js 26 (see `.nvmrc`)
- Docker Desktop, running

## First-time setup

```
npm install
cp .env.example .env     # local database settings; .env is gitignored
docker compose up -d     # start Postgres (run in your own Terminal; see the known issue below)
npm run db:migrate       # apply migrations to the dev database
npm run dev              # http://localhost:3000
```

## Database

Postgres 18 runs in Docker, defined in `docker-compose.yml`. It has two databases:

| Database                | Used by                                                |
| ----------------------- | ------------------------------------------------------ |
| `feature_requests_dev`  | `npm run dev`, your manual testing                     |
| `feature_requests_test` | Integration tests, which may wipe tables between tests |

```
docker compose up -d                          # start
docker compose down                           # stop (data is kept)
docker compose down -v && docker compose up -d   # reset: wipe all local data
```

- **Local only:** the database only accepts connections from this computer (`127.0.0.1:5432`), with user and password `postgres`.
- **Not secrets:** these credentials only work locally. Production credentials come from Neon and are never committed.
- **Migrations:** after changing `src/db/schema.ts`, run `npm run db:generate`, review the new SQL file in `drizzle/`, then run `npm run db:migrate`. Drizzle records applied migrations in `drizzle.__drizzle_migrations`, so each file is applied once.
- **Same as production:** the image is Debian-based `postgres:18`, matching Neon's major version, and its databases use Neon's collation, `C.UTF-8`. Collation decides text sort order: `C.UTF-8` puts every capitalized word first ("Banana, Zebra, apple"). Collation is fixed when a database is created, so after changing it, reset with `docker compose down -v && docker compose up -d`.

## Tests

| Command                    | Needs          | What it runs                                                                            |
| -------------------------- | -------------- | --------------------------------------------------------------------------------------- |
| `npm run test:unit`        | nothing        | `*.test.ts`: logic with no database. The pre-commit hook runs these.                    |
| `npm run test:integration` | local Postgres | `*.int.test.ts` against `feature_requests_test`. Every table is wiped before each test. |
| `npm run test:e2e`         | nothing        | Playwright smoke test against a local production build                                  |

Integration tests refuse to run unless `TEST_DATABASE_URL` names a database ending in `_test`, so they can't wipe dev or production data by mistake.

## Claude Code guardrails

A Claude Code hook (`.claude/hooks/block-env-files.mjs`, registered in `.claude/settings.json`) stops Claude from reading or changing `.env` files through any tool: Bash, Read, Edit, Write, Grep, Glob, or NotebookEdit. `.env.example` is allowed. If the hook itself fails, the action is blocked (`onFailure: "block"`).

- **What it checks:** the full text of Bash commands, and only the path fields of file tools. Editing a document that _mentions_ `.env` is fine.
- **A false positive:** any Bash command that merely mentions a `.env` name is blocked too, such as a heredoc or a commit message passed with `-m`. Claude uses the Edit tool for such files, and `git commit -F <file>` for such messages.
- **A guardrail against accidents, not a security boundary:** an indirect command, such as a recursive `grep` over the whole folder or a file name built from pieces, isn't caught. Real secrets also never live in local files: production values are only in Vercel.
- **Tested:** the matching logic has unit tests (`.claude/hooks/env-guard.test.mjs`), which run with `npm run test:unit` and in the pre-commit hook.

## Known issue: Docker commands from Claude Code's shell

Docker commands that **stream** a response hang when run from Claude Code's shell. That includes `docker run`, `docker compose up`, `docker logs -f` and `docker events`. The container is created but never started, because the client never gets an answer to its `attach`/`wait` requests.

- **Docker itself is fine.** The same commands work immediately in a normal Terminal.
- **The cause hasn't been identified.** It's most likely in how Claude Code runs shell commands.
- **The workaround:** run Docker commands yourself in a Terminal. Claude verifies the database by connecting to `127.0.0.1:5432` directly, without going through Docker.

Found on 2026-11-08 with Docker Desktop 4.98.0.
