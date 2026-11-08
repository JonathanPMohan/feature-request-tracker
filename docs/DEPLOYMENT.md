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
