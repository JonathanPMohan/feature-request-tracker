import { expect, test, type Page } from "@playwright/test";

// Browsing and submitting requests (spec S1 to S11), in a real browser
// against a production build.

const deployed = Boolean(process.env.PLAYWRIGHT_BASE_URL);

// With cacheComponents, pages you leave stay in the DOM, hidden. Always look
// inside the visible <main> (see CLAUDE.md).
const main = (page: Page) => page.getByRole("main");

// ── Browsing: read-only, so these run everywhere, production included ──────

test("a visitor can browse the board", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "Feature Requests" }),
  ).toBeVisible();
  // Decision A: with no filter, "Active" is the selected one.
  const filters = main(page).getByRole("navigation", {
    name: "Filter by status",
  });
  await expect(filters.getByRole("link", { name: "Active" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

// S7: the convenience redirect. (The real protection, the action refusing a
// visitor, is proven in actions.int.test.ts, where we can call it directly.)
test("a visitor who tries to submit is sent to sign in", async ({ page }) => {
  await page.goto("/");
  await main(page).getByRole("link", { name: "Submit a request" }).click();

  await expect(page).toHaveURL("/sign-in");
});

// S5: an id that can't be, or isn't, a request shows the not-found page.
// The status is 200, not 404: the page has started streaming before it knows
// (see src/app/requests/[id]/page.tsx). So we check what Next.js does
// instead: the not-found page, marked noindex so search engines skip it.
// "99999999999" is too big for Postgres: without parseRequestId, it would
// be a database error page here, not "not found".
test("a request that doesn't exist shows the not-found page", async ({
  page,
}) => {
  for (const id of ["abc", "0", "99999999999", "2147483647"]) {
    await page.goto(`/requests/${id}`);
    // getByRole skips hidden elements, so a page kept in the DOM from an
    // earlier visit can't match (CLAUDE.md). The robots tag is in <head>,
    // which is never a hidden page.
    await expect(
      page.getByRole("heading", { name: "This page could not be found." }),
    ).toBeVisible();
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex",
    );
  }
});

// ── Submitting: creates accounts and requests, so local and CI only ────────
// On a preview they'd add rows to its database, and every deployed run shares
// one IP address, so the sign-up rate limit would stop them anyway.
test.describe("submitting", () => {
  test.skip(deployed, "creates data, so it runs locally and in CI only");

  // Each test is its own visitor with its own address, so the sign-up rate
  // limit (5 per hour per address) doesn't trip across tests. See auth.spec.ts.
  test.beforeEach(async ({ page }) => {
    const part = () => Math.floor(Math.random() * 254) + 1;
    await page.setExtraHTTPHeaders({
      "x-forwarded-for": `10.${part()}.${part()}.${part()}`,
    });
    await signUp(page);
  });

  test("submit a request: it opens with 1 vote and appears on the board", async ({
    page,
  }) => {
    const title = `Dark mode ${Date.now()}`;

    await submitRequest(page, title, "Please add a dark theme.\n\nThanks!");

    // S11: we land on the new request's own page.
    await expect(page).toHaveURL(/\/requests\/\d+$/);
    await expect(
      main(page).getByRole("heading", { level: 1, name: title }),
    ).toBeVisible();
    // PLAN.md: a new request starts with its author's vote.
    await expect(main(page).getByText("1 vote", { exact: true })).toBeVisible();
    await expect(main(page).getByText("by Test Author")).toBeVisible();

    // S11: the board shows it straight away, not a stale list from before.
    await main(page).getByRole("link", { name: "All requests" }).click();
    await expect(
      main(page)
        .getByRole("list", { name: "Requests" })
        .getByRole("link", { name: title }),
    ).toBeVisible();
  });

  // S9: an error keeps what was typed. React 19 resets forms after an
  // action, so without returning the values this description would vanish.
  test("an error shows next to the field and keeps the typed text", async ({
    page,
  }) => {
    const description = "A long description I don't want to type again.";

    // Spaces pass the browser's `required`, so the server's check answers.
    await submitRequest(page, "   ", description);

    await expect(main(page).getByText("Title can't be empty.")).toBeVisible();
    await expect(main(page).getByLabel("Title")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(main(page).getByLabel("Description")).toHaveValue(description);
    await expect(page).toHaveURL("/requests/new");
  });

  // S6: text is shown as text. If the page ever used it as HTML, this script
  // would run and set the flag.
  test("a description containing HTML is shown, never run", async ({
    page,
  }) => {
    const html = '<img src=x onerror="window.__xss = true"> <b>bold?</b>';

    await submitRequest(page, `HTML test ${Date.now()}`, html);

    await expect(main(page).getByText(html)).toBeVisible();
    expect(await page.evaluate(() => "__xss" in window)).toBe(false);
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function signUp(page: Page) {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto("/sign-up");
  await main(page).getByLabel("Name").fill("Test Author");
  await main(page).getByLabel("Email").fill(email);
  await main(page).getByLabel("Password").fill("correct-horse-battery-staple");
  await main(page).getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("current-user")).toHaveText("Test Author");
}

async function submitRequest(page: Page, title: string, description: string) {
  await page.goto("/requests/new");
  await main(page).getByLabel("Title").fill(title);
  await main(page).getByLabel("Description").fill(description);
  await main(page).getByRole("button", { name: "Submit request" }).click();
}
