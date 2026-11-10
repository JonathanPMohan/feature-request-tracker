import { expect, test, type Page } from "@playwright/test";

// Sign up, sign out, and sign in, through the real pages in a real browser.
//
// These tests create accounts, so they must never run against production.
// They run locally (CI's own throwaway database) and on Vercel previews (each
// has its own Neon branch). On a deployed run they're skipped unless the
// workflow says the target is a preview, so a missing or unexpected value
// skips them too ("fail closed").
const deployed = Boolean(process.env.PLAYWRIGHT_BASE_URL);
const isPreview = process.env.DEPLOYMENT_ENVIRONMENT === "preview";
test.skip(
  deployed && !isPreview,
  "creates accounts, so it only runs locally and on previews",
);

// A preview's database keeps its rows between runs, so every test needs an
// email address no earlier run has used.
function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

const password = "correct-horse-battery-staple";

// With cacheComponents, Next.js keeps pages you navigated away from in the DOM,
// hidden. `getByLabel` would also find their fields, so always look inside the
// visible <main>: `getByRole` skips hidden elements.
const currentPage = (page: Page) => page.getByRole("main");

async function signUp(page: Page, name: string, email: string) {
  await page.goto("/sign-up");
  const main = currentPage(page);
  await main.getByLabel("Name").fill(name);
  await main.getByLabel("Email").fill(email);
  await main.getByLabel("Password").fill(password);
  await main.getByRole("button", { name: "Create account" }).click();
}

test("sign up signs you in", async ({ page }) => {
  await signUp(page, "Ada Lovelace", uniqueEmail());

  await expect(page).toHaveURL("/");
  // The header is rendered on the server from the session cookie, so this
  // proves the cookie was set and the server accepted it.
  await expect(page.getByTestId("current-user")).toHaveText("Ada Lovelace");
});

test("sign out, then sign in again", async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, "Grace Hopper", email);
  await expect(page.getByTestId("current-user")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByTestId("current-user")).toHaveCount(0);

  await page.getByRole("link", { name: "Sign in" }).click();
  const main = currentPage(page);
  await expect(main.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await main.getByLabel("Email").fill(email);
  await main.getByLabel("Password").fill(password);
  await main.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByTestId("current-user")).toHaveText("Grace Hopper");
});
