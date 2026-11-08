import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { request, type FullConfig } from "@playwright/test";

import { BYPASS_STATE_PATH, vercelBypassSecret } from "./vercel-bypass";

/**
 * Runs once before all tests. When testing a protected Vercel deployment, it
 * trades the bypass secret for a bypass cookie:
 *
 * 1. ONE request, to the deployment only, carries the secret and asks Vercel
 *    to set a cookie (`x-vercel-set-bypass-cookie`).
 * 2. The cookie is saved, and every test's browser starts with it.
 *
 * The browser never sees the secret. Browsers only send a cookie back to the
 * site that set it, so the cookie can't reach third-party servers the page
 * may load from.
 */
export default async function globalSetup(config: FullConfig) {
  const secret = vercelBypassSecret();
  if (!secret) return;

  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error("Vercel bypass: no baseURL is configured");

  const context = await request.newContext({ baseURL });
  const response = await context.get("/", {
    headers: {
      "x-vercel-protection-bypass": secret,
      "x-vercel-set-bypass-cookie": "true",
    },
  });
  // A rejected secret doesn't return an error status. Vercel redirects to its
  // login page, which loads fine. So check where we ended up, not just the status.
  const deploymentHost = new URL(baseURL).host;
  const finalHost = new URL(response.url()).host;
  if (!response.ok() || finalHost !== deploymentHost) {
    throw new Error(
      `Vercel bypass rejected: ended at ${finalHost} (HTTP ${response.status()}). ` +
        "Check VERCEL_AUTOMATION_BYPASS_SECRET.",
    );
  }

  await mkdir(dirname(BYPASS_STATE_PATH), { recursive: true });
  const state = await context.storageState({ path: BYPASS_STATE_PATH });
  await context.dispose();

  const deploymentCookies = state.cookies.filter(
    (cookie) => cookie.domain === deploymentHost,
  );
  if (deploymentCookies.length === 0) {
    throw new Error("Vercel bypass: no cookie was set for the deployment.");
  }
  // Show where each cookie is valid (never its value), so CI logs prove the scope.
  for (const cookie of deploymentCookies) {
    console.log(`Bypass cookie "${cookie.name}" is scoped to ${cookie.domain}`);
  }
}
