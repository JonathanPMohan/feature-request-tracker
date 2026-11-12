"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canSubmitRequest } from "@/lib/permissions";
import { consumeRateLimit, rateLimitMessage } from "@/lib/rate-limit";
import { parseRequestInput } from "@/lib/request-input";
import { createRequestWithVote } from "@/lib/requests";
import { getCurrentUser } from "@/lib/session";

import { SIGN_IN_MESSAGE, type SubmitState } from "./submit-state";

// SECURITY: every exported function in a "use server" file is a public POST
// endpoint. Anyone can call it with any data, signed in or not, without ever
// loading the form. So this function checks everything itself, and never
// trusts that the page already did.

/**
 * Submits a new feature request (spec S7 to S15).
 *
 * The steps run in PLAN.md's order. Only step 4 has a side effect (it uses up
 * quota), so it comes after every step that can refuse.
 *
 * Called by the form through useActionState, which passes the previous state
 * first. It's unused here: each submit stands on its own.
 */
export async function submitRequest(
  _previous: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const raw = {
    title: formData.get("title"),
    description: formData.get("description"),
  };
  // Sent back with every refusal, so the form keeps what was typed (S9).
  const values = {
    title: typeof raw.title === "string" ? raw.title : "",
    description: typeof raw.description === "string" ? raw.description : "",
  };

  // ── Step 1: who is this? ────────────────────────────────────────────────
  const user = await getCurrentUser();

  // ── Step 2: are they allowed? ───────────────────────────────────────────
  if (!canSubmitRequest(user)) {
    return { message: SIGN_IN_MESSAGE, values };
  }

  // ── Step 3: is the input valid? ─────────────────────────────────────────
  const input = parseRequestInput(raw);
  if (!input.success) return { fieldErrors: input.fieldErrors, values };

  // ── Step 4: under the limit? Last, because it uses up quota. ────────────
  const result = await consumeRateLimit(user.id, "submit");
  if (!result.allowed) {
    return { message: rateLimitMessage(result.retryAfterSeconds), values };
  }

  // ── Step 5: save ────────────────────────────────────────────────────────
  const id = await createRequestWithVote({ ...input.data, authorId: user.id });

  // The home page lists requests, and Next.js keeps pages you've visited
  // ready in the browser. This marks it stale, so it shows the new request
  // instead of the list from before (S11).
  revalidatePath("/");
  // Throws a special error that Next.js turns into a redirect, so nothing
  // after this line runs. (That's also why it's outside any try/catch.)
  redirect(`/requests/${id}`);
}
