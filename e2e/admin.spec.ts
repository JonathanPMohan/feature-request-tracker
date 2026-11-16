import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

// Admin controls in a real browser (spec A1, A4 to A6).
//
// Local and CI only, ALL of them: they need an admin, and no test should
// ever make one on a real deployment.
const deployed = Boolean(process.env.PLAYWRIGHT_BASE_URL);
test.skip(deployed, "makes an admin, so it runs locally and in CI only");

const main = (page: Page) => page.getByRole("main");

test.beforeEach(async ({ page }) => {
  // Its own address per test, for the sign-up rate limit (see auth.spec.ts).
  const part = () => Math.floor(Math.random() * 254) + 1;
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `10.${part()}.${part()}.${part()}`,
  });
});

// A1: a normal user sees none of it, on their own request too.
test("a normal user sees no admin controls", async ({ page }) => {
  await signUp(page);
  await submitRequestWithComment(page);

  await expect(main(page).getByRole("region", { name: "Admin" })).toHaveCount(
    0,
  );
  await expect(main(page).getByRole("button", { name: /^Delete/ })).toHaveCount(
    0,
  );
});

test.describe("as an admin", () => {
  let title: string;

  test.beforeEach(async ({ page }) => {
    const email = await signUp(page);
    title = await submitRequestWithComment(page);
    makeAdmin(email);
    // No new sign-in: the role is read from the database on every request
    // (spec A9), so a reload is enough to see the admin controls.
    await page.reload();
    await expect(
      main(page).getByRole("region", { name: "Admin" }),
    ).toBeVisible();
  });

  // Decision A (any to any) and M6's frozen votes, together: shipping a
  // request closes its voting at once.
  test("change a status, and voting freezes", async ({ page }) => {
    const vote = main(page).getByRole("button", { name: `Vote for ${title}` });
    await expect(vote).toBeEnabled();

    await main(page).getByLabel("Status").selectOption("shipped");

    await expect(vote).toBeDisabled();
    // Saved, not just shown.
    await page.reload();
    await expect(main(page).getByLabel("Status")).toHaveValue("shipped");
    await expect(vote).toBeDisabled();
  });

  test("delete a comment", async ({ page }) => {
    page.once("dialog", (dialog) => dialog.accept());

    await main(page)
      .getByRole("button", { name: "Delete comment by Admin To Be" })
      .click();

    await expect(
      main(page).getByRole("heading", { name: "Comments (0)" }),
    ).toBeVisible();
  });

  // A6: "Cancel" in the confirmation deletes nothing.
  test("cancelling the confirmation keeps the request", async ({ page }) => {
    const url = page.url();
    page.once("dialog", (dialog) => dialog.dismiss());

    await main(page).getByRole("button", { name: "Delete request" }).click();

    await expect(page).toHaveURL(url);
    await page.reload();
    await expect(
      main(page).getByRole("heading", { level: 1, name: title }),
    ).toBeVisible();
  });

  // A4: the request goes, and the admin lands on the board.
  test("delete a request, and land on the board", async ({ page }) => {
    const url = page.url();
    page.once("dialog", (dialog) => dialog.accept());

    await main(page).getByRole("button", { name: "Delete request" }).click();

    await expect(page).toHaveURL("/");
    await page.goto(url);
    await expect(
      page.getByRole("heading", { name: "This page could not be found." }),
    ).toBeVisible();
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function signUp(page: Page) {
  const email = `e2e-admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto("/sign-up");
  await main(page).getByLabel("Name").fill("Admin To Be");
  await main(page).getByLabel("Email").fill(email);
  await main(page).getByLabel("Password").fill("correct-horse-battery-staple");
  await main(page).getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("current-user")).toHaveText("Admin To Be");
  return email;
}

// Submits a request, adds a comment, and stays on its page. Returns its title.
async function submitRequestWithComment(page: Page) {
  const title = `Admin test ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await page.goto("/requests/new");
  await main(page).getByLabel("Title").fill(title);
  await main(page).getByLabel("Description").fill("Testing admin tools.");
  await main(page).getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/requests\/\d+$/);

  await main(page).getByLabel("Add a comment").fill("A comment to delete.");
  await main(page).getByRole("button", { name: "Post comment" }).click();
  await expect(
    main(page).getByRole("heading", { name: "Comments (1)" }),
  ).toBeVisible();
  return title;
}

// The same script a person uses (M3), against the same database as the
// app's server: locally from the project's environment file, in CI from the
// job's environment. Runs the script directly, like `npm run make-admin`.
function makeAdmin(email: string) {
  execFileSync("npm", ["run", "--silent", "make-admin", "--", email], {
    stdio: "pipe",
  });
}
