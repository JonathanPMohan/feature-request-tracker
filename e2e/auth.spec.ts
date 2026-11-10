import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

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

// RATE LIMITS
// A production build rate-limits sign-in and sign-up per client IP address,
// and Better Auth reads that address from the `x-forwarded-for` header.
//
// - Locally, nothing sets that header, so every test would share one bucket
//   and the suite would trip the limit after 3 requests. Giving each test its
//   own made-up address makes each test a separate visitor. The limits stay
//   on; the tests just stop competing with each other.
// - On Vercel, Vercel overwrites the header with the real address, so a
//   visitor can't do this trick, and deployed tests all share the CI runner's
//   address. That's why only the first test below runs on previews.
function uniqueIp() {
  const part = () => Math.floor(Math.random() * 254) + 1;
  return `10.${part()}.${part()}.${part()}`;
}

test.beforeEach(async ({ page }, testInfo) => {
  const ip = uniqueIp();
  // Saved so `createAccount` below can come from the same visitor.
  testInfo.annotations.push({ type: "client-ip", description: ip });
  await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
});

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

async function signIn(page: Page, email: string, withPassword: string) {
  await page.goto("/sign-in");
  const main = currentPage(page);
  await main.getByLabel("Email").fill(email);
  await main.getByLabel("Password").fill(withPassword);
  await main.getByRole("button", { name: "Sign in" }).click();
}

// Creates an account through the API instead of the form. Tests that are
// about something else (a wrong password, a duplicate email) only need an
// account to exist, and the `request` fixture has its own cookies, so the
// browser `page` stays signed out.
async function createAccount(request: APIRequestContext, email: string) {
  const ip = test
    .info()
    .annotations.find((a) => a.type === "client-ip")?.description;
  const response = await request.post("/api/auth/sign-up/email", {
    data: { email, password, name: "Existing User" },
    // Better Auth checks the Origin header on POSTs (protection against
    // cross-site requests), so send the one a browser would.
    headers: {
      origin: new URL(test.info().project.use.baseURL!).origin,
      "x-forwarded-for": ip!,
    },
  });
  expect(response.status()).toBe(200);
}

// Signed out = the header shows the "Sign in" link and no user name.
async function expectSignedOut(page: Page) {
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByTestId("current-user")).toHaveCount(0);
}

// The one test that also runs on Vercel previews: it proves the deployed app
// can create a user, set the session cookie, and read it back on the server.
test("sign up signs you in", async ({ page }) => {
  await signUp(page, "Ada Lovelace", uniqueEmail());

  await expect(page).toHaveURL("/");
  // The header is rendered on the server from the session cookie, so this
  // proves the cookie was set and the server accepted it.
  await expect(page.getByTestId("current-user")).toHaveText("Ada Lovelace");
});

// The rest run locally and in CI only. On a preview they'd share one IP and
// hit the rate limit; the first test already proves the deployment works.
test.describe("sign-in behavior", () => {
  test.skip(deployed, "runs locally and in CI, where each test has its own IP");

  test("sign out, then sign in again", async ({ page }) => {
    const email = uniqueEmail();
    await signUp(page, "Grace Hopper", email);
    await expect(page.getByTestId("current-user")).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expectSignedOut(page);

    await signIn(page, email, password);

    await expect(page).toHaveURL("/");
    await expect(page.getByTestId("current-user")).toHaveText("Grace Hopper");
  });

  test("a wrong password shows an error and doesn't sign you in", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail();
    await createAccount(request, email);

    await signIn(page, email, "not-the-right-password");

    // Scoped to <main>: Next.js has its own role="alert" element (the route
    // announcer for screen readers) outside it.
    await expect(currentPage(page).getByRole("alert")).toHaveText(
      "Invalid email or password",
    );
    await expect(page).toHaveURL("/sign-in");
    await expectSignedOut(page);
  });

  // User enumeration: if "no such account" and "wrong password" looked
  // different, an attacker could test a list of emails to learn who has an
  // account. Both must give the same answer.
  test("an unknown email gets the same error as a wrong password", async ({
    page,
  }) => {
    await signIn(page, uniqueEmail(), password);

    await expect(currentPage(page).getByRole("alert")).toHaveText(
      "Invalid email or password",
    );
    await expectSignedOut(page);
  });

  // Sign-up can't hide that an email is taken (it has to tell the user why
  // it failed). The rate limit is what stops anyone using this to check
  // emails in bulk.
  test("signing up with an email that's already used shows an error", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail();
    await createAccount(request, email);

    await signUp(page, "Someone Else", email);

    await expect(currentPage(page).getByRole("alert")).toContainText(
      "already exists",
    );
    await expect(page).toHaveURL("/sign-up");
    await expectSignedOut(page);
  });
});
