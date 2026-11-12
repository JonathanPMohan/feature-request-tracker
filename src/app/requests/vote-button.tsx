"use client";

import Link from "next/link";
import { useId, useOptimistic, useState, useTransition } from "react";

import { setVoteAction } from "./vote-action";
import type { VoteMode } from "./vote-mode";
import { VOTE_MESSAGES } from "./vote-state";

type Vote = { votes: number; voted: boolean };

const REASONS: Record<"demo" | "closed", string> = {
  demo: "The demo account can't vote. Sign up to vote.",
  closed: "Voting is closed for this request.",
};

const BUTTON =
  "flex min-w-14 flex-col items-center rounded-md border px-2 py-1 text-sm tabular-nums";
const UNVOTED =
  "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";
const VOTED =
  "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900";

/**
 * The vote button (spec V1 to V6).
 *
 * Two layers of state:
 * - `confirmed`: the latest known truth. It starts as what the page loaded
 *   (the props), then becomes the server's answer to each click.
 * - `shown`: what's on screen. During a click it's the optimistic guess
 *   (useOptimistic), so the count changes at once (V5). When the action
 *   finishes, React drops the guess and shows `confirmed`. If the server
 *   refused, `confirmed` didn't change, so the count goes back by itself.
 *
 * The props are only read once, when the button mounts. Pages give each
 * button a `key` that's new on every server render (see renderKey), so
 * fresh data from the server remounts it. An earlier version compared new
 * props with old ones instead, and missed fresh data that happened to equal
 * the first load (found by /code-review; tested in e2e/voting.spec.ts).
 */
export function VoteButton({
  requestId,
  title,
  votes,
  voted,
  mode,
}: Vote & { requestId: number; title: string; mode: VoteMode }) {
  const [confirmed, setConfirmed] = useState<Vote>({ votes, voted });

  const [shown, guess] = useOptimistic(confirmed);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const reasonId = useId();

  const label = `Vote for ${title}`;
  const count = (
    <>
      <span aria-hidden>▲</span>
      <span>{shown.votes}</span>
      <span className="sr-only">{shown.votes === 1 ? "vote" : "votes"}</span>
    </>
  );

  // A visitor: a link, not a button that fails. Signing in is the next step.
  if (mode === "sign-in") {
    return (
      <Link
        href="/sign-in"
        aria-label={`Sign in to vote for ${title}`}
        className={`${BUTTON} ${UNVOTED}`}
      >
        {count}
      </Link>
    );
  }

  // Decisions A and B: the count, in a button that says why it can't be
  // used. aria-describedby makes screen readers read the reason too.
  if (mode !== "vote") {
    return (
      <span className="flex flex-col items-center gap-1">
        <button
          type="button"
          disabled
          aria-label={label}
          aria-pressed={shown.voted}
          aria-describedby={reasonId}
          title={REASONS[mode]}
          className={`${BUTTON} ${shown.voted ? VOTED : UNVOTED} opacity-60`}
        >
          {count}
        </button>
        <span id={reasonId} className="sr-only">
          {REASONS[mode]}
        </span>
      </span>
    );
  }

  function handleClick() {
    // "Set", not "flip" (V4): ask for the opposite of what's on screen.
    const want = !shown.voted;
    setError(null);
    startTransition(async () => {
      guess({ voted: want, votes: shown.votes + (want ? 1 : -1) });
      // The action can also fail without answering: offline, a server
      // error, or a new deploy that no longer has this action's ID. Without
      // this catch, the error would escape the transition and replace the
      // whole page with the error screen (found by /code-review). Instead,
      // the guess is dropped and the count goes back, with a message.
      try {
        const result = await setVoteAction(requestId, want);
        if (result.ok)
          setConfirmed({ voted: result.voted, votes: result.votes });
        else setError(result.message);
      } catch {
        setError(VOTE_MESSAGES.failed);
      }
    });
  }

  return (
    <span className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        // Disabled while a vote is in flight, so a double-click sends one
        // request. A convenience only: the server is safe either way (V4).
        disabled={pending}
        aria-label={label}
        // A toggle button: screen readers say "pressed" when you've voted.
        aria-pressed={shown.voted}
        className={`${BUTTON} ${shown.voted ? VOTED : UNVOTED}`}
      >
        {count}
      </button>
      {error && (
        <span
          role="alert"
          className="max-w-40 text-xs text-red-600 dark:text-red-400"
        >
          {error}
        </span>
      )}
    </span>
  );
}
