// When a request can't reach the server at all (M10, P1).
//
// A server action or an auth call can fail without an answer: the browser
// is offline, the server errors, or a new deploy no longer has the action.
// That doesn't come back as a result; it's THROWN. Uncaught, it escapes:
// - from useActionState, to Next.js, which replaces the whole page with
//   "This page couldn't load", and what was typed is lost;
// - from an await in a click handler, before `setPending(false)`, so the
//   button says "Signing in…" forever.
// So each form catches it and shows one of these instead. M6 did the same
// for the vote button (VOTE_MESSAGES.failed).
//
// Plain data and one function, with no server code: client components
// import it.

export const CONNECTION_MESSAGES = {
  submit: "Your request couldn't be sent. Check your connection and try again.",
  comment:
    "Your comment couldn't be posted. Check your connection and try again.",
  auth: "We couldn't reach the server. Check your connection and try again.",
  signOut: "Couldn't sign out. Check your connection and try again.",
  admin: "That didn't work. Check your connection and try again.",
} as const;

/**
 * True for the error `redirect()` throws. A server action that redirects
 * (submitting a request, deleting one) does it by throwing this, and Next.js
 * must see it to navigate. A catch that swallowed it would leave the user on
 * the old page, so every catch above rethrows it.
 */
export function isRedirect(error: unknown): boolean {
  return (
    error instanceof Error &&
    "digest" in error &&
    String(error.digest).startsWith("NEXT_REDIRECT")
  );
}
