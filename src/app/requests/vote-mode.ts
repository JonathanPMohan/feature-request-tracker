import { canVote } from "@/lib/permissions";
import type { Status } from "@/lib/requests";
import type { CurrentUser } from "@/lib/session";

/**
 * What the vote button should do for this viewer and request (V2, V10).
 *
 * Worked out on the server, from Jonathan's canVote, and passed to the button.
 * This only decides what the button LOOKS like. The vote action asks canVote
 * again on every vote, so a tampered page can't vote where it shouldn't.
 */
export type VoteMode =
  | "vote" // can vote or take a vote back
  | "sign-in" // a visitor: the button is a link to sign in
  | "demo" // decision B: the demo account sees it disabled
  | "closed"; // decision A: shipped or declined

export function voteMode(
  user: CurrentUser | null,
  request: { status: Status },
): VoteMode {
  if (canVote(user, request)) return "vote";
  if (user === null) return "sign-in";
  return user.isDemo ? "demo" : "closed";
}

/**
 * A key that's new every time the server renders a page, for the vote
 * buttons on it. React keeps a component's state while its key stays the
 * same, and starts it fresh when the key changes. So: clicks keep their
 * state between server renders, and every server render (a visit, a
 * refresh) resets the buttons to the database's numbers.
 *
 * Call it after the page has read the request (cookies or URL), so it runs
 * per request, never once at build time.
 */
export function renderKey(): string {
  return crypto.randomUUID();
}
