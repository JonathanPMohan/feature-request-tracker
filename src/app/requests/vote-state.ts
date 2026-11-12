// What the vote action returns (spec M6). Outside vote-action.ts because a
// "use server" file may only export async functions.

export type VoteResult =
  /** The vote is set. `votes` is the request's new count. */
  | { ok: true; voted: boolean; votes: number }
  /** Refused. The button goes back to how it was and shows the message. */
  | { ok: false; message: string };

export const VOTE_MESSAGES = {
  signIn: "Sign in to vote.",
  notFound: "This request doesn't exist anymore.",
  notAllowed: "You can't vote on this request.",
  invalid: "That vote couldn't be understood. Please reload and try again.",
  failed: "Your vote couldn't be saved. Check your connection and try again.",
} as const;
