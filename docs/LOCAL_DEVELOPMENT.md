# Local development

## Requirements

- Node.js 26 (see `.nvmrc`)
- Docker Desktop, running

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
- **Same as production:** the image is Debian-based `postgres:18`, matching Neon's major version. It isn't the Alpine image, which can sort text differently.

## Known issue: Docker commands from Claude Code's shell

Docker commands that **stream** a response hang when run from Claude Code's shell. That includes `docker run`, `docker compose up`, `docker logs -f` and `docker events`. The container is created but never started, because the client never gets an answer to its `attach`/`wait` requests.

- **Docker itself is fine.** The same commands work immediately in a normal Terminal.
- **The cause hasn't been identified.** It's most likely in how Claude Code runs shell commands.
- **The workaround:** run Docker commands yourself in a Terminal. Claude verifies the database by connecting to `127.0.0.1:5432` directly, without going through Docker.

Found on 2026-11-08 with Docker Desktop 4.98.0.
