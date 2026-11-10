// Cross-site request forgery (CSRF): another website making a visitor's
// browser send a request to our app. The browser attaches our cookies
// automatically, so without a check, evil.example could sign a visitor out,
// or sign them into an account the attacker controls.
//
// Better Auth's defence: the browser always says where a POST came from (the
// Origin header, plus Sec-Fetch-* headers), and those can't be faked from
// another site's page. Requests from anywhere but our own pages are refused.
import { describe, expect, it } from "vitest";

import { GET, POST } from "./route";

const OUR_SITE = "http://localhost:3000";
const OTHER_SITE = "https://evil.example";

function post(
  path: string,
  {
    origin,
    cookie,
    headers = {},
    body = {},
  }: {
    origin: string;
    cookie?: string;
    headers?: Record<string, string>;
    body?: unknown;
  },
) {
  return POST(
    new Request(`${OUR_SITE}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}

async function signedInCookie(email: string) {
  const response = await post("/sign-up/email", {
    origin: OUR_SITE,
    body: { email, password: "correct-horse-battery-staple", name: "Ada" },
  });
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function isSignedIn(cookie: string) {
  const response = await GET(
    new Request(`${OUR_SITE}/api/auth/get-session`, { headers: { cookie } }),
  );
  return (await response.json()) !== null;
}

describe("requests from other websites", () => {
  // With a cookie: the request would act as the signed-in visitor. Signing
  // out is harmless, but it's the same check that will protect every action
  // that changes something.
  it("refuses a request that carries the visitor's cookie", async () => {
    const cookie = await signedInCookie("ada@example.com");

    const response = await post("/sign-out", { origin: OTHER_SITE, cookie });

    expect(response.status).toBe(403);
    expect(await isSignedIn(cookie)).toBe(true);
  });

  // The control case: the same request from our own page works. Without it,
  // the test above would also pass if sign-out were simply broken.
  it("allows the same request from our own site", async () => {
    const cookie = await signedInCookie("ada@example.com");

    const response = await post("/sign-out", { origin: OUR_SITE, cookie });

    expect(response.status).toBe(200);
    expect(await isSignedIn(cookie)).toBe(false);
  });

  // Without a cookie: "login CSRF". Another site posts a hidden form that
  // signs the visitor into the attacker's account; anything the visitor then
  // types (a request, a comment) lands in the attacker's account. These are
  // the headers a browser sends for a form posted from another site.
  it("refuses a sign-in form posted from another site", async () => {
    const response = await post("/sign-in/email", {
      origin: OTHER_SITE,
      headers: {
        "sec-fetch-site": "cross-site",
        "sec-fetch-mode": "navigate",
        "sec-fetch-dest": "document",
      },
      body: { email: "attacker@example.com", password: "anything-at-all" },
    });

    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("refuses a sign-up sent by another site's script", async () => {
    const response = await post("/sign-up/email", {
      origin: OTHER_SITE,
      body: {
        email: "drive-by@example.com",
        password: "correct-horse-battery-staple",
        name: "Drive-by",
      },
    });

    expect(response.status).toBe(403);
  });
});
