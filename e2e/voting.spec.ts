import { expect, test, type Page } from "@playwright/test";

import { DEMO_ACCOUNT } from "../src/lib/demo-account";

// Voting in a real browser (spec V1 to V6, V10).

const deployed = Boolean(process.env.PLAYWRIGHT_BASE_URL);
const main = (page: Page) => page.getByRole("main");

// ── Read-only: these run everywhere, production included ────────────────────
// They need at least one request on the board; a brand-new board has none.

// The board streams in after the page shell. Counting buttons before it
// arrives finds none, and the tests below would skip themselves: a silent
// pass. So wait until the board is there, either as a list or as "empty".
async function boardLoaded(page: Page) {
  await expect(
    main(page)
      .getByRole("list", { name: "Requests" })
      .or(main(page).getByText("No requests here yet.")),
  ).toBeVisible();
}

test("a visitor's vote button leads to sign in", async ({ page }) => {
  await page.goto("/");
  await boardLoaded(page);
  const signInToVote = main(page).getByRole("link", {
    name: /^Sign in to vote for /,
  });
  test.skip(
    (await signInToVote.count()) === 0,
    "the board has no requests yet",
  );

  await signInToVote.first().click();
  await expect(page).toHaveURL("/sign-in");
});

// Decision B: the demo account sees the counts, but can't vote.
//
// Local and CI only (found by /code-review): on Vercel every test shares one
// IP address, demo.spec.ts already signs in twice, and Better Auth allows 3
// sign-ins per 10 seconds per address. A third would fail at random.
test("the demo account's vote buttons are disabled", async ({ page }) => {
  test.skip(deployed, "a third deployed sign-in would trip the rate limit");
  await page.goto("/sign-in");
  await main(page)
    .getByRole("button", { name: "Sign in as the demo user" })
    .click();
  await expect(page.getByTestId("current-user")).toHaveText(DEMO_ACCOUNT.name);
  await boardLoaded(page);

  const voteButtons = main(page).getByRole("button", { name: /^Vote for / });
  test.skip((await voteButtons.count()) === 0, "the board has no requests yet");
  await expect(voteButtons.first()).toBeDisabled();
});

// ── Voting: creates accounts and changes counts, so local and CI only ──────
test.describe("voting", () => {
  test.skip(deployed, "creates data, so it runs locally and in CI only");

  test.beforeEach(async ({ page }) => {
    // Its own address per test, for the sign-up rate limit (see auth.spec.ts).
    const part = () => Math.floor(Math.random() * 254) + 1;
    await page.setExtraHTTPHeaders({
      "x-forwarded-for": `10.${part()}.${part()}.${part()}`,
    });
    await signUp(page);
  });

  // V1, on the request page. Your own request starts with your vote.
  test("take back your vote and vote again", async ({ page }) => {
    const title = await submitRequest(page);
    const button = main(page).getByRole("button", {
      name: `Vote for ${title}`,
    });
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(button).toContainText("1");

    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await expect(button).toContainText("0");

    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(button).toContainText("1");

    // It was saved, not just shown: a fresh load agrees.
    await page.reload();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(button).toContainText("1");
  });

  // V4 in the browser: a double-click ends voted, with one vote.
  //
  // What this proves is the BUTTON: it's disabled while a vote is in
  // flight, so the second click is ignored. It can't prove the server is
  // safe, because the server may only ever see one request here. That's
  // proven in vote-action.int.test.ts, which sends two "yes" at once.
  test("a double-click leaves one vote", async ({ page }) => {
    const title = await submitRequest(page);
    const button = main(page).getByRole("button", {
      name: `Vote for ${title}`,
    });
    await button.click(); // take back the author's vote: 0
    await expect(button).toContainText("0");
    await expect(button).toBeEnabled();

    await button.dblclick();
    // Wait for the vote to finish before reloading. Reloading at once can
    // cancel the request before it reaches the server, which made this
    // test fail now and then.
    await expect(button).toContainText("1");
    await expect(button).toBeEnabled();

    await page.reload();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(button).toContainText("1");
  });

  // Found by /code-review: a vote changed on one page must show on the
  // other. Someone else's request (1 vote): vote on the board (2), take it
  // back on the request's page (1), go back. The board loads fresh data,
  // {1 vote, not voted}, which is exactly what it loaded the first time.
  // It must show that, not the click from before (2, voted).
  // (Someone else's request, so the count never drops to 0 and the request
  // stays on page 1 however many requests the database holds.)
  test("a vote changed on the request page shows on the board", async ({
    page,
  }) => {
    const title = await submitRequest(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Sign in" }),
    ).toBeVisible();
    await signUp(page); // a second user, who hasn't voted for it

    await page.goto("/");
    const onBoard = main(page).getByRole("button", {
      name: `Vote for ${title}`,
    });
    await expect(onBoard).toContainText("1");
    await onBoard.click();
    await expect(onBoard).toContainText("2");
    await expect(onBoard).toBeEnabled();

    // Wait for each navigation to finish before looking for the button.
    // Right after a click, the old page is still on screen, and its button
    // (about to be hidden) would match instead.
    await main(page).getByRole("link", { name: title }).click();
    await expect(page).toHaveURL(/\/requests\/\d+$/);
    const onPage = main(page).getByRole("button", {
      name: `Vote for ${title}`,
    });
    await onPage.click();
    await expect(onPage).toContainText("1");
    await expect(onPage).toBeEnabled();

    await main(page).getByRole("link", { name: "All requests" }).click();
    await expect(page).toHaveURL("/");
    await expect(onBoard).toHaveAttribute("aria-pressed", "false");
    await expect(onBoard).toContainText("1");
  });

  // Found by /code-review: when the vote request fails outright (here, the
  // browser drops it, like going offline), the count goes back and a
  // message shows. Before the fix, the error replaced the whole page.
  test("a vote that can't reach the server goes back, with a message", async ({
    page,
  }) => {
    const title = await submitRequest(page);
    const button = main(page).getByRole("button", {
      name: `Vote for ${title}`,
    });
    await expect(button).toContainText("1");

    // Server actions are POSTs to the page. Drop every POST from now on.
    await page.route("**/*", (route) =>
      route.request().method() === "POST" ? route.abort() : route.continue(),
    );
    await button.click();

    await expect(main(page).getByRole("alert")).toHaveText(
      "Your vote couldn't be saved. Check your connection and try again.",
    );
    await expect(button).toContainText("1");
    await expect(button).toHaveAttribute("aria-pressed", "true");
  });

  // V6: clicking changes the count in place; the order changes on the next
  // load. B is newer, so it starts above A. Taking back B's vote puts it
  // below A in the real order, but not while you're looking at it.
  test("the board doesn't re-sort under your cursor", async ({ page }) => {
    const a = await submitRequest(page, "A");
    const b = await submitRequest(page, "B");
    await page.goto("/");
    expect(await indexOf(page, b)).toBeLessThan(await indexOf(page, a));

    const bButton = main(page).getByRole("button", { name: `Vote for ${b}` });
    await bButton.click();
    await expect(bButton).toContainText("0");
    expect(await indexOf(page, b)).toBeLessThan(await indexOf(page, a));

    // Fresh load: B (0 votes) is now below A (1 vote). With enough voted
    // requests in the database, B may even have moved to page 2.
    await page.reload();
    const bAfter = await indexOf(page, b, { mayBeMissing: true });
    expect(bAfter === -1 || bAfter > (await indexOf(page, a))).toBe(true);
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function signUp(page: Page) {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto("/sign-up");
  await main(page).getByLabel("Name").fill("Voter");
  await main(page).getByLabel("Email").fill(email);
  await main(page).getByLabel("Password").fill("correct-horse-battery-staple");
  await main(page).getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("current-user")).toHaveText("Voter");
}

// Submits a request with a unique title, lands on its page, returns the title.
async function submitRequest(page: Page, prefix = "Vote test") {
  const title = `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await page.goto("/requests/new");
  await main(page).getByLabel("Title").fill(title);
  await main(page).getByLabel("Description").fill("Testing votes.");
  await main(page).getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/requests\/\d+$/);
  return title;
}

// Where a request sits on this page of the board (0 is the top).
async function indexOf(
  page: Page,
  title: string,
  { mayBeMissing = false } = {},
) {
  await boardLoaded(page);
  const titles = await main(page)
    .getByRole("list", { name: "Requests" })
    .getByRole("listitem")
    .allInnerTexts();
  const index = titles.findIndex((text) => text.includes(title));
  if (!mayBeMissing) {
    expect(index, `${title} is on the board`).toBeGreaterThanOrEqual(0);
  }
  return index;
}
