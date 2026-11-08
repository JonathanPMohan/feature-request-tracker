import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { request, type FullConfig } from "@playwright/test";

import { BYPASS_STATE_PATH, vercelBypassSecret } from "./vercel-bypass";

/**
 * Runs once before all tests. When testing a protected Vercel deployment, it
 * trades the bypass secret for a bypass cookie:
 *
 * 1. ONE request, to the deployment only, carries the secret and asks Vercel
 *    to set a cookie (`x-vercel-set-bypass-cookie`). Redirects are not followed,
 *    so the secret can't be carried along to another host.
 * 2. The cookie is checked, saved, and every test's browser starts with it.
 *
 * The browser never sees the secret. Browsers only send a cookie back to the
 * site that set it, so the cookie can't reach third-party servers the page
 * may load from.
 */
export default async function globalSetup(config: FullConfig) {
  // Never let a file from an earlier run stand in for this one.
  await rm(BYPASS_STATE_PATH, { force: true });

  const secret = vercelBypassSecret();
  if (!secret) return;

  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error("Vercel bypass: no baseURL is configured");
  const deploymentHost = new URL(baseURL).host;

  const context = await request.newContext({ baseURL });
  try {
    const response = await context.get("/", {
      headers: {
        "x-vercel-protection-bypass": secret,
        "x-vercel-set-bypass-cookie": "true",
      },
      maxRedirects: 0,
    });

    // Accepted: the page itself, or a redirect that stays on the deployment
    // (Vercel sets the cookie on a redirect). Rejected: a redirect to another
    // host, such as Vercel's login page.
    const status = response.status();
    const location = response.headers()["location"];
    const redirectHost = location ? new URL(location, baseURL).host : undefined;
    const isRedirect = status >= 300 && status < 400;
    if (!response.ok() && !(isRedirect && redirectHost === deploymentHost)) {
      const where = redirectHost ? `, redirecting to ${redirectHost}` : "";
      throw new Error(
        `Vercel bypass rejected: HTTP ${status}${where}. ` +
          "Check VERCEL_AUTOMATION_BYPASS_SECRET.",
      );
    }

    // A cookie set with a Domain attribute is stored with a leading dot.
    const state = await context.storageState();
    const deploymentCookies = state.cookies.filter(
      (cookie) => cookie.domain.replace(/^\./, "") === deploymentHost,
    );
    if (deploymentCookies.length === 0) {
      throw new Error("Vercel bypass: no cookie was set for the deployment.");
    }

    // Save only after validating, and only this deployment's cookies.
    await mkdir(dirname(BYPASS_STATE_PATH), { recursive: true });
    await writeFile(
      BYPASS_STATE_PATH,
      JSON.stringify({ cookies: deploymentCookies, origins: [] }, null, 2),
    );
    // Show where each cookie is valid (never its value), so CI logs prove the scope.
    for (const cookie of deploymentCookies) {
      console.log(
        `Bypass cookie "${cookie.name}" is scoped to ${cookie.domain}`,
      );
    }
  } finally {
    await context.dispose();
  }
}
