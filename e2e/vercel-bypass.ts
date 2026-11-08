// Shared by playwright.config.ts and global-setup.ts.

// Where global setup saves the browser state (the bypass cookie) for tests to start from.
export const BYPASS_STATE_PATH = "playwright/.auth/vercel-bypass.json";

/**
 * The Vercel bypass secret, but only when we're testing a deployed URL.
 * Locally (no PLAYWRIGHT_BASE_URL), the secret is never used, even if it's set.
 */
export function vercelBypassSecret(): string | undefined {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return process.env.PLAYWRIGHT_BASE_URL && secret ? secret : undefined;
}
