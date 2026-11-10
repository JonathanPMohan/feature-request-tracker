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
