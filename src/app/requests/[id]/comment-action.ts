"use server";

import { revalidatePath } from "next/cache";

import { createComment, findCommentByKey } from "@/lib/comments";
import { isSubmissionKey, parseCommentInput } from "@/lib/comment-input";
import { canComment } from "@/lib/permissions";
import { consumeRateLimit, rateLimitMessage } from "@/lib/rate-limit";
import { findRequest } from "@/lib/requests";
import { getCurrentUser } from "@/lib/session";

import { COMMENT_MESSAGES, type CommentState } from "./comment-state";

// SECURITY: like every "use server" export, this is a public POST endpoint
// (see M6's walkthrough). It checks everything itself.

/**
 * Adds a comment to a request (spec C1 to C10). Called by the comment form
 * through useActionState, which passes the previous state first.
 *
 * The form sends three fields: requestId, body, and submissionKey.
 */
export async function addCommentAction(
  _previous: CommentState,
  formData: FormData,
): Promise<CommentState> {
  const requestId = formData.get("requestId");
  const body = formData.get("body");
  const sentKey = formData.get("submissionKey");

  // Every refusal sends back what was typed, and the same key, so the form
  // keeps the text (C6) and a retry stays the same comment (decision C). A
  // key that isn't a UUID is replaced, or every retry would fail again.
  const retryKey = isSubmissionKey(sentKey) ? sentKey : crypto.randomUUID();
  const keep = {
    body: typeof body === "string" ? body : "",
    submissionKey: retryKey,
  };
  const refuse = (message: string): CommentState => ({ ...keep, message });

  // ── Step 1: who is this? ──────────────────────────────────
  const user = await getCurrentUser();

  // ── Step 2: are they allowed? ─────────────────────────────
  // a. Visitors must sign in.
  if (user === null) {
    return refuse(COMMENT_MESSAGES.signIn);
  }

  // b. Does the request exist?
  const target = await findRequest(requestId);
  if (target === null) {
    return refuse(COMMENT_MESSAGES.notFound);
  }

  // c. The demo account can't comment.
  if (!canComment(user, target)) {
    return refuse(COMMENT_MESSAGES.notAllowed);
  }

  // ── Step 3: is the input valid? ─────────────────────────────────────────
  const input = parseCommentInput({ body, submissionKey: sentKey });
  if (!input.success) {
    if (input.badKey) return refuse(COMMENT_MESSAGES.reload);
    return { ...keep, bodyError: input.bodyError };
  }

  // Already saved with this key? (Decision C; found by /code-review.) A read,
  // so it's allowed before the rate limit, and that's the point: a retry of
  // a comment that's already there costs no quota, and can't be refused.
  const existing = await findCommentByKey(user.id, input.data.submissionKey);
  if (existing?.requestId === target.id) return saved(target.id);
  // The key was used on another request: a stale form, or a hand-made POST.
  // Saving would silently do nothing, so ask for a resend with a new key.
  if (existing) {
    return {
      ...refuse(COMMENT_MESSAGES.reload),
      submissionKey: crypto.randomUUID(),
    };
  }

  // ── Step 4: under the limit? Last, it uses up quota. ──────
  const result = await consumeRateLimit(user.id, "comment");
  if (!result.allowed) {
    return refuse(rateLimitMessage(result.retryAfterSeconds));
  }

  // ── Step 5: save ────────────────────────────────────────────────────────
  // `created: false` without `requestGone` means the same key arrived twice
  // at the same moment and the other copy saved it: still "saved".
  const outcome = await createComment({
    requestId: target.id,
    authorId: user.id,
    body: input.data.body,
    submissionKey: input.data.submissionKey,
  });
  if (outcome.requestGone) return refuse(COMMENT_MESSAGES.notFound);
  return saved(target.id);
}

/**
 * The answer when the comment is saved: re-render the request's page, so it
 * shows at once (C6), and give the form a new key for the next comment.
 */
function saved(requestId: number): CommentState {
  revalidatePath(`/requests/${requestId}`);
  return { saved: true, submissionKey: crypto.randomUUID() };
}
