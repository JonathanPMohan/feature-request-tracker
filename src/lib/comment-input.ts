import { z } from "zod";

import { textField } from "./request-input";

// Validation for a new comment (spec C5). The body follows the same rules as
// a request's description (M5), from the same code, so they can't drift.

export const COMMENT_MAX = 2000;

// Decision C: the key that makes a double-submit the same comment. The
// column is Postgres `uuid`, which would refuse anything else with a
// database error, so it's checked here first.
const submissionKeySchema = z.uuid();

/**
 * Whether a value is a valid submission key. The ONE definition, used by the
 * schema below and by the action when it picks the key for a retry. Two
 * different checks once disagreed on keys like ...-1234-... (an invalid
 * variant digit), so a bad key could come back unchanged (/code-review).
 */
export function isSubmissionKey(value: unknown): value is string {
  return submissionKeySchema.safeParse(value).success;
}

const commentInputSchema = z.object({
  body: textField("Comment", COMMENT_MAX),
  submissionKey: submissionKeySchema,
});

export type CommentInput = z.infer<typeof commentInputSchema>;

export function parseCommentInput(input: {
  body: unknown;
  submissionKey: unknown;
}):
  | { success: true; data: CommentInput }
  | { success: false; bodyError?: string; badKey: boolean } {
  const result = commentInputSchema.safeParse(input);
  if (result.success) return { success: true, data: result.data };

  const { fieldErrors } = z.flattenError(result.error);
  return {
    success: false,
    bodyError: fieldErrors.body?.[0],
    // Not the user's fault: the form always sends a valid key. Only a
    // hand-made POST, or a broken page, gets here.
    badKey: Boolean(fieldErrors.submissionKey),
  };
}
