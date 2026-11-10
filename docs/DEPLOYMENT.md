# Deployment setup

The app deploys to Vercel from GitHub. These settings live outside the code, so they're listed here.

## Vercel project

| Setting                              | Where                                                      | Why                                                                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub access limited to this repo   | GitHub → Settings → Applications → Vercel → Configure      | Least privilege                                                                                                                                                       |
| Node.js version                      | `engines.node` in `package.json` (overrides the dashboard) | Same Node version locally, in CI, and on Vercel                                                                                                                       |
| Deployment Protection (Standard)     | Settings → Deployment Protection                           | Previews and deployment URLs require login                                                                                                                            |
| Protection Bypass for Automation     | Settings → Deployment Protection                           | Lets the deployed smoke test reach protected deployments                                                                                                              |
| **`repository_dispatch` Events: on** | Settings → Git                                             | Vercel sends `vercel.deployment.success` to GitHub, which starts `e2e-deployed.yml`. **Off by default.** With it off, deployments succeed but are never smoke-tested. |

## Database (Neon)

| Setting                         | Value                                                                                 | Why                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Neon project                    | `feature-request-tracker`, AWS US East 1, Postgres 18                                 | Same region as Vercel's default functions region (Washington, D.C.); same major version as local Docker                                                                 |
| Vercel connection               | **Neon-Managed** integration ("Link Existing Neon Account"), this Vercel project only | Preview branches are deleted when their git branch is deleted. Vercel-Managed waits for Vercel's deployment retention, which can exceed the Free plan's 10-branch limit |
| Preview branches                | On: one Neon branch per preview, named `preview/<git-branch>`                         | A PR's migrations never touch production data                                                                                                                           |
| Delete obsolete branches        | On                                                                                    | Keeps the project under the Free plan's 10-branch limit                                                                                                                 |
| Neon Auth / Managed Better Auth | Off                                                                                   | Auth uses the Better Auth library directly (M3)                                                                                                                         |

### Migrations

Migrations run **during Vercel's build**: `vercel.json` sets the build command to `npm run db:migrate && npm run build`.

- **Previews** migrate their own Neon branch. **Production** migrates the production branch.
- **A failed migration fails the deploy**, and the previous version stays live.
- **Migrations use `DATABASE_URL_UNPOOLED`** (a direct connection). Neon's pooler doesn't support the session features migration tools need. The app itself uses the pooled `DATABASE_URL`.
- **New schema meets old code briefly.** During a deploy, the new schema is live while the old code still serves requests. So changes go in compatible steps: add a column, then use it in a later deploy (expand/contract).

## Auth (Better Auth)

| Vercel variable      | Production                                   | Preview                      | Why                                                                                                 |
| -------------------- | -------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET` | Its own random value                         | A **different** random value | Signs session cookies. Separate values mean a leaked preview secret can't forge production sessions |
| `BETTER_AUTH_URL`    | `https://feature-request-tracker.vercel.app` | **Unset**                    | Previews get a new address on every deploy                                                          |

**What happens without the secret:** the build still succeeds, but in production mode every auth request fails with HTTP 500. The smoke test checks `/api/auth/ok` on every deployment, so a missing secret shows up as a failed deployed smoke test.

**How previews know their own address:** with `BETTER_AUTH_URL` unset, `src/lib/auth-options.ts` takes the address from each request, and accepts only hosts matching `feature-request-tracker-*-jonathanpmohan.vercel.app`.

- **The `*` can match across dots,** so the pattern alone is loose. That's acceptable on Vercel, which routes requests by hostname, so only our own deployments' hostnames ever reach the app.
- **Production without `BETTER_AUTH_URL` fails loudly:** its hostname isn't on the preview list, so the first auth request throws.

**Tables:**

- **Generated, not hand-written:** Better Auth's tables are generated into `src/db/auth-schema.ts` by `npm run auth:generate`. The generator reads the shared options in `src/lib/auth-options.ts` through `scripts/auth-schema.config.mts`, since it can't load the app's `server-only` auth module.
- **Then migrated like any other change:** `npm run db:generate` turns the schema into a migration, which deploys apply as usual.

**Every deploy** runs `db:migrate`, then `db:seed-demo` (creates the demo account if it's missing), then the build (`vercel.json`).

### Production checklist

Some checks can't be automated from the repo, because they need the Vercel or Neon dashboard. Run through these before the first production deploy with auth, and again after changing auth settings.

| Check                                             | Where                                                                        | Expect                                                                                                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production has its own `BETTER_AUTH_SECRET`       | Vercel → Settings → Environment Variables                                    | Set for **Production**, and a separate entry for **Preview**. Never one shared entry                                                                     |
| `BETTER_AUTH_URL` is the exact production address | Same page                                                                    | **Production only:** `https://feature-request-tracker.vercel.app`, with no trailing slash. Not set for Preview                                           |
| The rate limit sees real visitor addresses        | Neon → the preview branch → SQL Editor: `select key, count from rate_limit;` | Keys start with an IP address (e.g. `203.0.113.7\|/sign-in/email`). A key starting `no-trusted-ip` means everyone shares one limit: stop and investigate |
| After the merge: the production deploy built      | Vercel → Deployments                                                         | The production build ran the migrations and the seed without errors                                                                                      |
| After the merge: the production smoke test passed | GitHub → Actions → E2E (deployed)                                            | Includes the demo sign-in and the Secure-cookie check                                                                                                    |

Checked automatically on every deployment instead: `/api/auth/ok` responds (so the secret is set), the demo account can sign in, and the session cookie is `Secure`, `HttpOnly` and `SameSite=Lax`.

## GitHub repository

| Setting                                  | Where                                      | Why                                                                                       |
| ---------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `VERCEL_AUTOMATION_BYPASS_SECRET` secret | Settings → Secrets and variables → Actions | Copied from Vercel's bypass setting; used only by `e2e/global-setup.ts`                   |
| Branch protection on `main`              | Settings → Branches                        | PR required; CI jobs and the `Vercel` check must pass; applies to admins; no force pushes |

## How a deployment gets tested

1. Vercel builds a deployment for every push to any branch. `ci.yml` runs on pull requests and on pushes to `main`.
2. When the deployment succeeds, Vercel sends `repository_dispatch` (`vercel.deployment.success`).
3. `e2e-deployed.yml`, which must exist on `main`, verifies the URL and branch, then runs the Playwright smoke test against the deployment.
4. `e2e/global-setup.ts` exchanges the bypass secret for a cookie scoped to that one deployment. The browser never sees the secret.

Known gaps are tracked in issues #2, #3, and #4.
