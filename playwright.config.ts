import { defineConfig, devices } from "@playwright/test";

import { BYPASS_STATE_PATH, vercelBypassSecret } from "./e2e/vercel-bypass";

// Two modes:
// - PLAYWRIGHT_BASE_URL unset: build the app, start the production server, test localhost.
// - PLAYWRIGHT_BASE_URL set (e.g. a Vercel preview URL): test that deployment directly.
// `|| undefined` treats an empty string as unset, the same way everywhere below.
const deployedUrl = process.env.PLAYWRIGHT_BASE_URL || undefined;
// Not 3000, so a running `npm run dev` can never stand in for the production build.
const localPort = 3100;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  // Exchanges the Vercel bypass secret for a cookie before any test runs. See global-setup.ts.
  globalSetup: "./e2e/global-setup.ts",
  // Fail CI if someone accidentally commits a `test.only`, which would skip every other test.
  forbidOnly: isCI,
  // One retry in CI absorbs a rare network blip. A test that only passes on retry
  // is reported as "flaky", so problems stay visible instead of being hidden.
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: deployedUrl ?? `http://localhost:${localPort}`,
    // Records a step-by-step trace when a test is retried, for debugging CI failures.
    trace: "on-first-retry",
    // Tests start with the bypass cookie, never the secret itself.
    storageState: vercelBypassSecret() ? BYPASS_STATE_PATH : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: deployedUrl
    ? undefined
    : {
        // A production build, not `next dev`, so tests see what users will see.
        // The seed makes sure the demo account exists (it's idempotent).
        command: `npm run db:seed-demo && npm run build && npm run start -- --port ${localPort}`,
        url: `http://localhost:${localPort}`,
        // Better Auth must know its real address, or it rejects sign-ins coming
        // from this port as "untrusted origin".
        env: { BETTER_AUTH_URL: `http://localhost:${localPort}` },
        // Always start our own server. Reusing one could mean testing whatever else
        // happens to be on the port; if the port is busy, fail loudly instead.
        reuseExistingServer: false,
        timeout: 180_000,
      },
});
