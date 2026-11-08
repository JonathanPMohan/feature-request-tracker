import { defineConfig, devices } from "@playwright/test";

import { BYPASS_STATE_PATH, vercelBypassSecret } from "./e2e/vercel-bypass";

// Two modes:
// - PLAYWRIGHT_BASE_URL unset: build the app, start the production server, test localhost.
// - PLAYWRIGHT_BASE_URL set (e.g. a Vercel preview URL): test that deployment directly.
const deployedUrl = process.env.PLAYWRIGHT_BASE_URL;
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
    baseURL: deployedUrl ?? "http://localhost:3000",
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
        command: "npm run build && npm run start",
        url: "http://localhost:3000",
        // Locally, reuse a server you already have running; CI always starts fresh.
        reuseExistingServer: !isCI,
        timeout: 180_000,
      },
});
