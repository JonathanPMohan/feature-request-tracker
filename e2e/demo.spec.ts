import { expect, test } from "@playwright/test";

import { DEMO_ACCOUNT } from "../src/lib/demo-account";

// The demo account is how reviewers try the app, so check it on every
// deployment, production included. It only signs in, never creates an
// account, so it's safe to run anywhere.
test("a visitor can sign in as the demo user in one click", async ({
  page,
}) => {
  await page.goto("/sign-in");

  await page
    .getByRole("main")
    .getByRole("button", { name: "Sign in as the demo user" })
    .click();

  await expect(page).toHaveURL("/");
  await expect(page.getByTestId("current-user")).toHaveText(DEMO_ACCOUNT.name);
});

// Over https (every Vercel deployment), the session cookie must be Secure, so
// the browser never sends it over plain http where it could be read in
// transit. Better Auth also gives it the __Secure- prefix, which browsers only
// accept with the Secure flag. Locally the server is plain http, so this only
// runs against deployments.
test("the session cookie is Secure on https", async ({ page, baseURL }) => {
  test.skip(
    !baseURL?.startsWith("https://"),
    "only https deployments use Secure cookies",
  );

  await page.goto("/sign-in");
  await page
    .getByRole("main")
    .getByRole("button", { name: "Sign in as the demo user" })
    .click();
  await expect(page.getByTestId("current-user")).toBeVisible();

  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name.endsWith("session_token"));

  expect(session?.name).toBe("__Secure-better-auth.session_token");
  expect(session?.secure).toBe(true);
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");
});
