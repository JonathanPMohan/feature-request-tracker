// What the comment action sends back to the form (spec M7). Outside the
// action's file because a "use server" file may only export async functions.

export type CommentState = {
  /** True right after a comment was saved: the form clears itself. */
  saved?: boolean;
  /** A problem with the whole form: not signed in, rate-limited, ... */
  message?: string;
  /** A problem with the comment's text, shown next to the box. */
  bodyError?: string;
  /** What was typed, so a refusal never loses it (C6). */
  body?: string;
  /**
   * The submission key the form must send next (decision C). The same key
   * after a refusal, so a retry is still the same comment. A new one after a
   * save, so the next comment is a new one.
   */
  submissionKey?: string;
};

export const COMMENT_MESSAGES = {
  signIn: "Sign in to comment.",
  notFound: "This request doesn't exist anymore.",
  notAllowed: "You can't comment on this request.",
  reload: "Something went wrong with this form. Reload the page and try again.",
} as const;
