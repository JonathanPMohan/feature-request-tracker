// Integration tests for the submit action (spec S7, S10, S12, S14, S15),
// calling it the way an attacker would: directly, with any FormData, no page
// involved. The database is real; only the parts that need a running Next.js
// server are replaced with fakes (below).
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import type { CurrentUser } from "@/lib/session";

import { submitRequest } from "./actions";
import { INITIAL_SUBMIT_STATE, SIGN_IN_MESSAGE } from "./submit-state";

// ── Fakes ───────────────────────────────────────────────────────────────────
// vi.mock replaces a module for every file that imports it, including
// actions.ts. Vitest moves these calls to the top of the file, before the
// imports above run; vi.hoisted lets them share variables with the tests.
const fake = vi.hoisted(() => ({
  // Who getCurrentUser() says is signed in. Each test sets it.
  user: null as CurrentUser | null,
}));

// The real one reads the session cookie from the incoming request, and
// there's no request here. Faking it is how a test "signs in".
vi.mock("@/lib/session", () => ({
  getCurrentUser: async () => fake.user,
}));

// Both need a running Next.js server. The fakes record the calls instead.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  // The real redirect() throws too, so the action stops at the same point.
  redirect: vi.fn((url: string) => {
    throw new Redirect(url);
  }),
}));

class Redirect extends Error {
  constructor(readonly url: string) {
    super(`redirect to ${url}`);
  }
}

const { revalidatePath } = await import("next/cache");

// ── Helpers ─────────────────────────────────────────────────────────────────
let counter = 0;
async function signInAs(overrides: Partial<CurrentUser> = {}) {
  counter += 1;
  const user: CurrentUser = {
    id: `action-user-${counter}`,
    name: "Ada",
    email: `action-user-${counter}@example.com`,
    role: "user",
    isDemo: false,
    ...overrides,
  };
  await db.execute(
    sql`insert into "user" (id, name, email, is_demo)
        values (${user.id}, ${user.name}, ${user.email}, ${user.isDemo})`,
  );
  fake.user = user;
  return user;
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const valid = { title: "Dark mode", description: "Please add a dark theme." };

// Runs the action. Returns where it redirected, or the state it returned.
async function submit(data: FormData) {
  try {
    return { state: await submitRequest(INITIAL_SUBMIT_STATE, data) };
  } catch (error) {
    if (error instanceof Redirect) return { redirectedTo: error.url };
    throw error;
  }
}

async function savedRequests() {
  const { rows } = await db.execute<{
    id: number;
    title: string;
    description: string;
    author_id: string;
    votes: number;
  }>(sql`select r.id, r.title, r.description, r.author_id,
                (select count(*)::int from vote v where v.request_id = r.id) as votes
         from feature_request r order by r.id`);
  return rows;
}

async function quotaUsed() {
  const { rows } = await db.execute<{ n: number }>(
    sql`select coalesce(sum(count), 0)::int as n from action_rate_limit`,
  );
  return rows[0].n;
}

beforeEach(() => {
  fake.user = null;
  vi.clearAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────
describe("submitRequest", () => {
  // The happy path, S10 and S11.
  it("saves the request with the author's vote, then opens it", async () => {
    const ada = await signInAs();

    const result = await submit(form(valid));

    const [saved] = await savedRequests();
    expect(saved).toMatchObject({ ...valid, author_id: ada.id, votes: 1 });
    expect(result).toEqual({ redirectedTo: `/requests/${saved.id}` });
    // The home page is marked stale, so it shows the new request (S11).
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("saves the cleaned-up text, not what was sent", async () => {
    await signInAs();

    await submit(form({ title: "  Dark mode  ", description: "One\r\nTwo" }));

    expect(await savedRequests()).toMatchObject([
      { title: "Dark mode", description: "One\nTwo" },
    ]);
  });

  // The demo account is how reviewers try the app.
  it("lets the demo account submit", async () => {
    await signInAs({ isDemo: true });
    expect(await submit(form(valid))).toHaveProperty("redirectedTo");
  });

  describe("a visitor (S7)", () => {
    // THE security test. The form is behind sign-in, but the action is a
    // public endpoint: this is the POST someone sends without the form.
    it("is refused, and nothing is saved", async () => {
      const result = await submit(form(valid));

      expect(result).toEqual({
        state: { message: SIGN_IN_MESSAGE, values: valid },
      });
      expect(await savedRequests()).toEqual([]);
    });

    // S14: a visitor never reaches the rate limit (they have no id to count
    // against anyway: step 2 must stop them before step 4).
    it("uses no rate-limit quota", async () => {
      await submit(form(valid));
      expect(await quotaUsed()).toBe(0);
    });

    // Finding 7 from /code-review, Jonathan's fix: the permission check
    // (step 2) comes before validation (step 3). A visitor who sends an
    // empty title is told to sign in, not to fix a form they can't submit
    // anyway. If validation ran first, they'd get "Title can't be empty."
    it("is told to sign in, even when the input is invalid", async () => {
      const typed = { title: "", description: "" };

      const result = await submit(form(typed));

      expect(result).toEqual({
        state: { message: SIGN_IN_MESSAGE, values: typed },
      });
      expect(await savedRequests()).toEqual([]);
    });
  });

  describe("invalid input (S8, S9)", () => {
    it("returns an error for each field, and what was typed", async () => {
      await signInAs();
      const typed = { title: "   ", description: "A long description..." };

      const result = await submit(form(typed));

      expect(result).toEqual({
        state: {
          fieldErrors: { title: "Title can't be empty." },
          values: typed,
        },
      });
      expect(await savedRequests()).toEqual([]);
    });

    // S14, S15: validation (step 3) comes before the rate limit (step 4),
    // so a typo doesn't cost one of the user's 10 submits.
    it("uses no rate-limit quota", async () => {
      await signInAs();
      await submit(form({ title: "", description: "" }));
      expect(await quotaUsed()).toBe(0);
    });

    // A hand-made POST can leave fields out entirely. That must be a field
    // error, not a crash.
    it("handles missing fields", async () => {
      await signInAs();

      const result = await submit(new FormData());

      expect(result).toEqual({
        state: {
          fieldErrors: {
            title: "Title is required.",
            description: "Description is required.",
          },
          values: { title: "", description: "" },
        },
      });
    });
  });

  describe("the rate limit (S12)", () => {
    it("refuses the 11th submit in an hour, and saves only 10", async () => {
      await signInAs();
      for (let i = 0; i < 10; i++) {
        expect(await submit(form(valid))).toHaveProperty("redirectedTo");
      }

      const result = await submit(form(valid));

      expect(result).toEqual({
        state: {
          // Decision B: say when to come back. A fresh window has about an
          // hour left.
          message: expect.stringMatching(/Try again in 60 minutes\.$/),
          values: valid,
        },
      });
      expect(await savedRequests()).toHaveLength(10);
    });

    // A successful submit uses exactly one: the count matches what was saved.
    it("uses one unit of quota per saved request", async () => {
      await signInAs();
      await submit(form(valid));
      await submit(form(valid));
      expect(await quotaUsed()).toBe(2);
    });
  });
});
