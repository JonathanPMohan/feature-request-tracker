import { expect, test } from "@playwright/test";

// Smoke test: does the app start and serve its home page at all?
// It runs against a local production build in CI, and against every successful
// Vercel deployment (previews and production) via e2e-deployed.yml.
test("home page loads", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("Feature Requests");
  // Find elements the way assistive technology does: by role and accessible name.
  await expect(
    page.getByRole("heading", { level: 1, name: "Feature Requests" }),
  ).toBeVisible();
});
