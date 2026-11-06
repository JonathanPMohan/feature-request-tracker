import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Lets tests import with the same "@/..." shortcut the app uses (defined in tsconfig.json).
    tsconfigPaths: true,
  },
  test: {
    // Unit tests only: fast, no database, safe to run on every commit.
    // Integration tests (*.int.test.ts) get their own setup in M2, when there's a database.
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.int.test.ts"],
    // Tests run in plain Node. We test logic, not rendered components.
    environment: "node",
  },
});
