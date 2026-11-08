import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("Better Auth route handler", () => {
  it("responds to its health check, proving the config and handler load", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/auth/ok"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("returns 404 for an auth endpoint that doesn't exist", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/auth/not-a-real-endpoint"),
    );

    expect(response.status).toBe(404);
  });
});
