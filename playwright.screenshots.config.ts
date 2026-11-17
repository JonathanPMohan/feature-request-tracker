import { defineConfig, devices } from "@playwright/test";

// `npm run screenshots`: retakes the README's screenshots (M9 spec, L6).
//
// Not a test suite: CI never runs it, and it has no assertions worth the
// name. It's a Playwright config because Playwright already knows how to
// open a page at a fixed size and save a picture of it.
//
// Against production by default, as a visitor only: it never signs in and
// never submits, so it can't change anything there. Point it elsewhere
// with SCREENSHOT_URL, e.g. SCREENSHOT_URL=http://localhost:3000.
export default defineConfig({
  testDir: "./scripts",
  testMatch: "screenshots.spec.ts",
  reporter: "list",
  use: {
    baseURL:
      process.env.SCREENSHOT_URL ||
      "https://feature-request-tracker.vercel.app",
    // Light mode: GitHub shows the README on white for most readers.
    colorScheme: "light",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});
