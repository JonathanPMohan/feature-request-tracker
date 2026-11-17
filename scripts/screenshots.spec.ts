import { expect, test, type Page } from "@playwright/test";

// Takes the README's screenshots. Run with `npm run screenshots`; see
// playwright.screenshots.config.ts for where and why.
//
// Each picture waits for the content it shows, so a slow page can't leave
// a half-loaded board in the README.

const main = (page: Page) => page.getByRole("main");
const dir = "docs/screenshots";

test("board", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(
    main(page).getByRole("list", { name: "Requests" }),
  ).toBeVisible();
  await page.screenshot({ path: `${dir}/board-${testInfo.project.name}.png` });
});

// The desktop board only: the phone shot above shows the same page.
test("a request's page", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop only");
  // The request with the most votes on the Shipped board: one that shows a
  // decided status, frozen votes and (usually) a conversation.
  await page.goto("/?status=shipped");
  const shipped = main(page)
    .getByRole("list", { name: "Requests" })
    .locator('a[href^="/requests/"]');
  await expect(
    shipped.first(),
    "no shipped request on this board yet: ship one first (M9 decision A)",
  ).toBeVisible();
  await shipped.first().click();
  await expect(page).toHaveURL(/\/requests\/\d+$/);
  await expect(
    main(page).getByRole("heading", { name: /^Comments \(\d+\)$/ }),
  ).toBeVisible();
  await page.screenshot({ path: `${dir}/request.png`, fullPage: true });
});

test("demo sign-in", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop only");
  await page.goto("/sign-in");
  await expect(
    main(page).getByRole("button", { name: "Sign in as the demo user" }),
  ).toBeVisible();
  await page.screenshot({ path: `${dir}/sign-in.png` });
});
