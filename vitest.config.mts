import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Integration tests read TEST_DATABASE_URL: from .env locally, from the workflow in CI.
// Node's loader never overrides variables that are already set.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  resolve: {
    // Lets tests import with the same "@/..." shortcut the app uses (defined in tsconfig.json).
    tsconfigPaths: true,
  },
  test: {
    // Tests run in plain Node. We test logic, not rendered components.
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          // Fast, no database, safe to run on every commit (the pre-commit hook runs these).
          name: "unit",
          // .claude/hooks: the Claude Code hook that guards .env files.
          include: ["src/**/*.test.ts", ".claude/hooks/**/*.test.mjs"],
          exclude: ["src/**/*.int.test.ts"],
        },
      },
      {
        extends: true,
        resolve: {
          alias: {
            // `server-only` throws unless imported from Next's server build. These tests
            // run server code in plain Node, so use the package's empty server version.
            "server-only": fileURLToPath(
              new URL("./node_modules/server-only/empty.js", import.meta.url),
            ),
          },
        },
        test: {
          // Real database (TEST_DATABASE_URL). Run in CI and on demand, not on every commit.
          name: "integration",
          include: ["src/**/*.int.test.ts"],
          // Every test file shares one database, so run files one at a time.
          fileParallelism: false,
          env: {
            // The app's db module reads DATABASE_URL. Point it at the test database.
            DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
            // Fixed test-only auth settings, so tests don't depend on a local
            // secret. Not a real secret: test databases hold no real users.
            BETTER_AUTH_SECRET:
              "test-only-secret-not-used-outside-integration-tests",
            BETTER_AUTH_URL: "http://localhost:3000",
          },
          globalSetup: ["./src/test/integration/global-setup.ts"],
          setupFiles: ["./src/test/integration/setup.ts"],
        },
      },
    ],
  },
});
