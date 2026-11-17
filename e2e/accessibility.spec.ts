import { execFileSync } from "node:child_process";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Automated accessibility checks on the main pages (M9 spec, L2).
//
// axe runs the automated part of the WCAG 2.1 A and AA rules inside the
// page: missing labels, low contrast, broken heading order, buttons with no
// name, and so on. It can't judge everything: whether the focus order makes
// sense, or whether a screen reader user can follow the page. That still
// takes a person with a keyboard, and the README says so.
//
// We fail on "serious" and "critical" problems only. "Moderate" and "minor"
// findings are mostly advice; they're printed, but don't fail the test.
//
// Every page is checked in light AND dark mode: the app follows the
// system's setting, and contrast is different in each.

const deployed = Boolean(process.env.PLAYWRIGHT_BASE_URL);
const main = (page: Page) => page.getByRole("main");

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });

    // ── Read-only: these run everywhere, production included ──────────────

    test("the board", async ({ page }) => {
      await page.goto("/");
      await boardLoaded(page);
      await expectNoSeriousProblems(page);
    });

    test("a request's page", async ({ page }) => {
      await page.goto("/");
      await boardLoaded(page);
      const request = main(page)
        .getByRole("list", { name: "Requests" })
        .locator('a[href^="/requests/"]');
      test.skip((await request.count()) === 0, "the board has no requests yet");
      await request.first().click();
      await expect(page).toHaveURL(/\/requests\/\d+$/);
      await expect(main(page).getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoSeriousProblems(page);
    });

    test("sign in", async ({ page }) => {
      await page.goto("/sign-in");
      await expect(main(page).getByLabel("Email")).toBeVisible();
      await expectNoSeriousProblems(page);
    });

    test("sign up", async ({ page }) => {
      await page.goto("/sign-up");
      await expect(main(page).getByLabel("Name")).toBeVisible();
      await expectNoSeriousProblems(page);
    });

    // ── Signed in: local and CI only, since they create an account ────────

    test.describe("signed in", () => {
      test.skip(
        deployed,
        "creates an account, so it runs locally and in CI only",
      );

      test.beforeEach(async ({ page }) => {
        // Its own address, for the sign-up rate limit (see auth.spec.ts).
        const part = () => Math.floor(Math.random() * 254) + 1;
        await page.setExtraHTTPHeaders({
          "x-forwarded-for": `10.${part()}.${part()}.${part()}`,
        });
      });

      test("new request, with an error showing", async ({ page }) => {
        await signUp(page);
        await page.goto("/requests/new");
        // With the server's field errors showing: they must be readable and
        // tied to their fields too, not only the empty form. Spaces pass the
        // browser's `required`, so the server answers (see requests.spec.ts).
        await main(page).getByLabel("Title").fill("   ");
        await main(page).getByLabel("Description").fill("   ");
        await main(page)
          .getByRole("button", { name: "Submit request" })
          .click();
        await expect(
          main(page).getByText("Title can't be empty."),
        ).toBeVisible();
        await expectNoSeriousProblems(page);
      });

      // The admin controls from M8: a status menu and delete buttons.
      test("a request's page, as an admin", async ({ page }) => {
        const email = await signUp(page);
        await page.goto("/requests/new");
        await main(page)
          .getByLabel("Title")
          .fill(`Accessibility ${Date.now()}`);
        await main(page)
          .getByLabel("Description")
          .fill("Checking admin tools.");
        await main(page)
          .getByRole("button", { name: "Submit request" })
          .click();
        await expect(page).toHaveURL(/\/requests\/\d+$/);
        await main(page).getByLabel("Add a comment").fill("A comment.");
        await main(page).getByRole("button", { name: "Post comment" }).click();
        await expect(
          main(page).getByRole("heading", { name: "Comments (1)" }),
        ).toBeVisible();

        execFileSync("npm", ["run", "--silent", "make-admin", "--", email], {
          stdio: "pipe",
        });
        await page.reload();
        await expect(
          main(page).getByRole("region", { name: "Admin" }),
        ).toBeVisible();
        await expectNoSeriousProblems(page);
      });
    });
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function expectNoSeriousProblems(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const describe = (v: (typeof results.violations)[number]) =>
    `${v.impact}: ${v.id} (${v.help}), at ${v.nodes
      .map((n) => n.target.join(" "))
      .join(", ")}`;

  const advice = results.violations.filter(
    (v) => v.impact !== "serious" && v.impact !== "critical",
  );
  if (advice.length > 0) {
    console.log(`Advice on ${page.url()}:\n${advice.map(describe).join("\n")}`);
  }

  // Compared as text, so a failure lists each problem and where it is.
  const serious = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(describe);
  expect(serious, `accessibility problems on ${page.url()}`).toEqual([]);
}

// The board streams in after the page shell; check it once it's there.
async function boardLoaded(page: Page) {
  await expect(
    main(page)
      .getByRole("list", { name: "Requests" })
      .or(main(page).getByText("No requests here yet.")),
  ).toBeVisible();
}

async function signUp(page: Page) {
  const email = `e2e-a11y-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto("/sign-up");
  await main(page).getByLabel("Name").fill("Checker");
  await main(page).getByLabel("Email").fill(email);
  await main(page).getByLabel("Password").fill("correct-horse-battery-staple");
  await main(page).getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("current-user")).toHaveText("Checker");
  return email;
}
