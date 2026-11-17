import { execFileSync } from "node:child_process";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

// The main path, start to finish (M9 spec, L1).
//
// Every other e2e file tests one feature alone. This test follows ONE
// request through the whole product, with four different people, the way a
// reviewer will use the app. It's long on purpose: what it proves is that
// the steps work TOGETHER. For example, that a vote cast before an admin
// decision is still counted afterwards, but can no longer change.
//
// It also runs at phone width (the "phone" project in playwright.config.ts,
// L3), and checks at every step that the page doesn't scroll sideways.
//
// Local and CI only: it creates accounts, requests and an admin, and no
// test may do that on a real deployment.
const deployed = Boolean(process.env.PLAYWRIGHT_BASE_URL);
test.skip(
  deployed,
  "creates data and an admin, so it runs locally and in CI only",
);

const main = (page: Page) => page.getByRole("main");

// Contexts made by hand aren't closed by Playwright, so close them here.
const contexts: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
});

test("a request goes from idea to shipped", async ({ browser }, testInfo) => {
  // Four people, four separate browsers (contexts): separate cookies, so
  // each is signed in as themselves at the same time, like real users.
  const author = await openBrowser(browser, testInfo);
  const voter = await openBrowser(browser, testInfo);
  const admin = await openBrowser(browser, testInfo);
  const visitor = await openBrowser(browser, testInfo);

  // 1. The author submits a request. Their own vote is counted: it opens at 1.
  await signUp(author, "Asha");
  const title = `Journey ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await author.goto("/requests/new");
  await main(author).getByLabel("Title").fill(title);
  await main(author)
    .getByLabel("Description")
    .fill("Export the board as a CSV file.");
  await main(author).getByRole("button", { name: "Submit request" }).click();
  await expect(author).toHaveURL(/\/requests\/\d+$/);
  const requestUrl = author.url();
  // M10, P6: the tab says which request it is.
  await expect(author).toHaveTitle(`${title} · Feature Requests`);
  await expect(voteButton(author, title)).toContainText("1");
  await fitsWidth(author);

  // 2. Someone else finds it on the board, votes, and comments.
  await signUp(voter, "Ben");
  await voter.goto("/");
  await main(voter).getByRole("link", { name: title, exact: true }).click();
  await expect(voter).toHaveURL(requestUrl);
  await voteButton(voter, title).click();
  await expect(voteButton(voter, title)).toContainText("2");
  await expect(voteButton(voter, title)).toBeEnabled(); // saved, not just shown
  await main(voter).getByLabel("Add a comment").fill("Yes, for our reports.");
  await main(voter).getByRole("button", { name: "Post comment" }).click();
  await expect(
    main(voter).getByRole("heading", { name: "Comments (1)" }),
  ).toBeVisible();
  await fitsWidth(voter);

  // 3. The author sees the vote and the comment.
  await author.reload();
  await expect(voteButton(author, title)).toContainText("2");
  await expect(main(author).getByText("Yes, for our reports.")).toBeVisible();

  // 4. An admin ships it. (Promoted with the same script a person uses.)
  const adminEmail = await signUp(admin, "Admin");
  makeAdmin(adminEmail);
  await admin.goto(requestUrl);
  await main(admin).getByLabel("Status").selectOption("shipped");
  await expect(voteButton(admin, title)).toBeDisabled();
  await fitsWidth(admin);

  // 5. The voter's vote is frozen: still counted, still theirs, but it can't
  //    be taken back now that the request is decided (M6 decision A).
  await voter.reload();
  await expect(main(voter).getByText("Shipped", { exact: true })).toBeVisible();
  await expect(voteButton(voter, title)).toBeDisabled();
  await expect(voteButton(voter, title)).toContainText("2");
  await expect(voteButton(voter, title)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // What a screen reader says, and what a voice-control user can say: the
  // visible count first, then the action (WCAG 2.5.3, found by axe in M9).
  await expect(voteButton(voter, title)).toHaveAccessibleName(
    `2 votes. Vote for ${title}`,
  );

  // 6. A visitor, signed out, finds it under "Shipped", not on the default
  //    "Active" board. (With 2 votes and the newest of its ties, it would be
  //    on the first page of "Active" if it were still there.)
  await visitor.goto("/");
  const filters = main(visitor).getByRole("navigation", {
    name: "Filter by status",
  });
  await expect(filters.getByRole("link", { name: "Active" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // Wait for the board to arrive before counting: it streams in after the
  // page shell, and "no link" would be true before it loads (a silent pass).
  await expect(
    main(visitor).getByRole("list", { name: "Requests" }),
  ).toBeVisible();
  await expect(
    main(visitor).getByRole("link", { name: title, exact: true }),
  ).toHaveCount(0);
  await filters.getByRole("link", { name: "Shipped" }).click();
  await expect(filters.getByRole("link", { name: "Shipped" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    main(visitor).getByRole("link", { name: title, exact: true }),
  ).toBeVisible();
  await fitsWidth(visitor);
});

// ── Helpers ─────────────────────────────────────────────────────────────────

// A new browser context with this project's settings. Contexts made by hand
// don't get them from the config, so they're copied over: the address of
// the app, and, in the phone project, the phone's screen and touch.
async function openBrowser(browser: Browser, testInfo: TestInfo) {
  const {
    baseURL,
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
  } = testInfo.project.use;
  const context = await browser.newContext({
    baseURL,
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
  });
  contexts.push(context);
  // Its own address, for the sign-up rate limit (see auth.spec.ts).
  const part = () => Math.floor(Math.random() * 254) + 1;
  await context.setExtraHTTPHeaders({
    "x-forwarded-for": `10.${part()}.${part()}.${part()}`,
  });
  return context.newPage();
}

async function signUp(page: Page, name: string) {
  const email = `e2e-journey-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto("/sign-up");
  await main(page).getByLabel("Name").fill(name);
  await main(page).getByLabel("Email").fill(email);
  await main(page).getByLabel("Password").fill("correct-horse-battery-staple");
  await main(page).getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("current-user")).toHaveText(name);
  return email;
}

const voteButton = (page: Page, title: string) =>
  main(page).getByRole("button", { name: `Vote for ${title}` });

// See admin.spec.ts: the same script a person uses, against the same
// database as the app's server.
function makeAdmin(email: string) {
  execFileSync("npm", ["run", "--silent", "make-admin", "--", email], {
    stdio: "pipe",
  });
}

// L3: nothing wider than the screen. A page that scrolls sideways on a phone
// usually means something is cut off, and it's the first thing a reviewer
// on their phone would notice.
async function fitsWidth(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, "the page scrolls sideways").toBeLessThanOrEqual(
    clientWidth,
  );
}
