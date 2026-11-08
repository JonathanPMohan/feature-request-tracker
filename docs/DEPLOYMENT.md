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
