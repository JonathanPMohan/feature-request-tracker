import type { RequestFieldErrors } from "@/lib/request-input";

// What the submit action sends back to the form when it doesn't succeed. (On
// success it redirects instead, so there's nothing to return.)
//
// These live outside actions.ts because a "use server" file may only export
// async functions: everything it exports becomes a callable endpoint.
export type SubmitState = {
  /** A problem with the whole form: not signed in, or rate-limited. */
  message?: string;
  /** A problem with one field, shown next to it. */
  fieldErrors?: RequestFieldErrors;
  /**
   * What the user typed, sent back so the form can show it again (spec S9).
   * React 19 resets a form after its action runs, even when it fails, so
   * without this a typo in the title would wipe a long description.
   */
  values?: { title: string; description: string };
};

export const INITIAL_SUBMIT_STATE: SubmitState = {};

export const SIGN_IN_MESSAGE = "Sign in to submit a request.";
