import { expect, test, type Page } from "@playwright/test";

import { DEMO_ACCOUNT } from "../src/lib/demo-account";

// Comments in a real browser (spec C1 to C6, decisions B and C).

const deployed = Boolean(process.env.PLAYWRIGHT_BASE_URL);
const main = (page: Page) => page.getByRole("main");

// ── Read-only: runs everywhere, production included ─────────────────────────

test("a visitor can read comments and is asked to sign in to comment", async ({
  page,
}) => {
  await page.goto("/");
  // The board streams in after the shell: wait for it (see voting.spec.ts).
  await expect(
    main(page)
      .getByRole("list", { name: "Requests" })
      .or(main(page).getByText("No requests here yet.")),
  ).toBeVisible();
  const firstRequest = main(page)
    .getByRole("list", { name: "Requests" })
    // Each row has two links: the vote button (for a visitor, "Sign in to
    // vote for …") comes first, then the title. Only the title opens the
    // request.
    .locator('a[href^="/requests/"]')
    .first();
  test.skip(
    (await firstRequest.count()) === 0,
    "the board has no requests yet",
  );

  await firstRequest.click();
  await expect(page).toHaveURL(/\/requests\/\d+$/);
  await expect(
    main(page).getByRole("heading", { name: /^Comments \(\d+\)$/ }),
  ).toBeVisible();
  await expect(
    main(page).getByRole("link", { name: "Sign in to comment" }),
  ).toBeVisible();
  await expect(main(page).getByLabel("Add a comment")).toHaveCount(0);
});

// ── Adding comments: creates data, so local and CI only ─────────────────────
test.describe("commenting", () => {
  test.skip(deployed, "creates data, so it runs locally and in CI only");

  test.beforeEach(async ({ page }) => {
    // Its own address per test, for the sign-up rate limit (see auth.spec.ts).
    const part = () => Math.floor(Math.random() * 254) + 1;
    await page.setExtraHTTPHeaders({
      "x-forwarded-for": `10.${part()}.${part()}.${part()}`,
    });
  });

  // C6: the comment appears at once, and the box is empty for the next one.
  test("post a comment: it appears, and the box clears", async ({ page }) => {
    await signUpAndSubmit(page);

    await postComment(page, "First!\nOn two lines.");

    const comments = main(page).getByRole("list", { name: "Comments" });
    await expect(comments.getByRole("listitem")).toHaveCount(1);
    await expect(comments).toContainText("First!");
    await expect(
      main(page).getByRole("heading", { name: "Comments (1)" }),
    ).toBeVisible();
    await expect(main(page).getByLabel("Add a comment")).toHaveValue("");
  });

  // Decision C's control case, in the browser: a deliberate second "+1" is
  // a new comment, because each comment gets a new key after a save. If the
  // key didn't change, the second would be silently dropped.
  test("the same text posted twice on purpose is two comments", async ({
    page,
  }) => {
    await signUpAndSubmit(page);

    await postComment(page, "+1");
    await expect(
      main(page).getByRole("heading", { name: "Comments (1)" }),
    ).toBeVisible();
    await postComment(page, "+1");

    await expect(
      main(page).getByRole("heading", { name: "Comments (2)" }),
    ).toBeVisible();
  });

  // Decision C, through the button: a double-click posts once.
  test("a double-click posts one comment", async ({ page }) => {
    await signUpAndSubmit(page);
    await main(page).getByLabel("Add a comment").fill("Only once, please.");

    await main(page).getByRole("button", { name: "Post comment" }).dblclick();

    await expect(
      main(page).getByRole("heading", { name: "Comments (1)" }),
    ).toBeVisible();
    // Reload, so the count comes from the database, not the page.
    await page.reload();
    await expect(
      main(page).getByRole("heading", { name: "Comments (1)" }),
    ).toBeVisible();
  });

  // C6: a refusal keeps what was typed.
  test("an error keeps the typed text", async ({ page }) => {
    await signUpAndSubmit(page);

    // Spaces pass the browser's `required`, so the server answers.
    await postComment(page, "    ");

    await expect(main(page).getByText("Comment can't be empty.")).toBeVisible();
    await expect(main(page).getByLabel("Add a comment")).toHaveValue("    ");
    await expect(
      main(page).getByRole("heading", { name: "Comments (0)" }),
    ).toBeVisible();
  });

  // C2: text, never HTML.
  test("a comment containing HTML is shown, never run", async ({ page }) => {
    await signUpAndSubmit(page);
    const html = '<img src=x onerror="window.__xss = true"> <b>bold?</b>';

    await postComment(page, html);

    await expect(
      main(page).getByRole("list", { name: "Comments" }),
    ).toContainText(html);
    expect(await page.evaluate(() => "__xss" in window)).toBe(false);
  });

  // Decision B. Local and CI only, like voting.spec.ts's demo test: on
  // deployments, another sign-in would trip the sign-in rate limit.
  test("the demo account can't comment", async ({ page }) => {
    await page.goto("/");
    const firstRequest = main(page)
      .getByRole("list", { name: "Requests" })
      .locator('a[href^="/requests/"]')
      .first();
    await expect(firstRequest).toBeVisible();
    const href = await firstRequest.getAttribute("href");

    await page.goto("/sign-in");
    await main(page)
      .getByRole("button", { name: "Sign in as the demo user" })
      .click();
    await expect(page.getByTestId("current-user")).toHaveText(
      DEMO_ACCOUNT.name,
    );
    await page.goto(href!);

    await expect(
      main(page).getByText(
        "The demo account can't comment. Sign up to join the conversation.",
      ),
    ).toBeVisible();
    await expect(main(page).getByLabel("Add a comment")).toHaveCount(0);
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

// Signs up a fresh user, submits a request, and lands on its page.
async function signUpAndSubmit(page: Page) {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto("/sign-up");
  await main(page).getByLabel("Name").fill("Commenter");
  await main(page).getByLabel("Email").fill(email);
  await main(page).getByLabel("Password").fill("correct-horse-battery-staple");
  await main(page).getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("current-user")).toHaveText("Commenter");

  await page.goto("/requests/new");
  await main(page).getByLabel("Title").fill(`Comment test ${Date.now()}`);
  await main(page).getByLabel("Description").fill("Testing comments.");
  await main(page).getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/requests\/\d+$/);
  await expect(
    main(page).getByRole("heading", { name: "Comments (0)" }),
  ).toBeVisible();
}

async function postComment(page: Page, text: string) {
  await main(page).getByLabel("Add a comment").fill(text);
  await main(page).getByRole("button", { name: "Post comment" }).click();
  // No wait here: right after the click, the button may not be disabled
  // yet, so "wait until enabled" could pass at once and prove nothing. Each
  // test waits for the result it expects instead (a count, an error).
}
