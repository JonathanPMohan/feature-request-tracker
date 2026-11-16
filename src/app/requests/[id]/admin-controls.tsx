"use client";

import { useState, useTransition, type ReactNode } from "react";

import { STATUS_LABELS, STATUSES, type Status } from "@/lib/statuses";

import {
  deleteCommentAction,
  deleteRequestAction,
  setStatusAction,
} from "./admin-actions";
import type { AdminResult } from "./admin-state";

// The admin controls on a request's page (spec A1, A6). The page only shows
// them to admins; the actions check again on every call (A2), so these are
// a convenience, not the protection.

/**
 * Runs an admin action, keeping track of "busy" and showing any refusal.
 * An action can also fail without answering (offline, a server error): the
 * same lesson as M6's vote button, so that's caught too.
 */
function useAdminAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<AdminResult>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) setError(result.message);
      } catch (thrown) {
        // redirect() works by throwing, and Next.js must see it to navigate.
        if (isRedirect(thrown)) throw thrown;
        setError("That didn't work. Check your connection and try again.");
      }
    });
  }

  return { pending, error, run };
}

function isRedirect(error: unknown) {
  return (
    error instanceof Error &&
    "digest" in error &&
    String(error.digest).startsWith("NEXT_REDIRECT")
  );
}

function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-red-600 dark:text-red-400">
      {children}
    </p>
  );
}

/** Status menu and "Delete request", above the description. */
export function RequestAdminControls({
  requestId,
  title,
  status,
}: {
  requestId: number;
  title: string;
  status: Status;
}) {
  const { pending, error, run } = useAdminAction();

  return (
    <section
      aria-label="Admin"
      className="mt-6 flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950"
    >
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 font-medium">
          Status
          <select
            defaultValue={status}
            disabled={pending}
            onChange={(event) => {
              const next = event.target.value;
              run(() => setStatusAction(requestId, next));
            }}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 font-normal dark:border-zinc-700 dark:bg-zinc-900"
          >
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            // A6: deleting can't be undone, and takes the votes and
            // comments too, so say so before doing it.
            const sure = window.confirm(
              `Delete "${title}"? Its votes and comments will be deleted too. This can't be undone.`,
            );
            if (sure) run(() => deleteRequestAction(requestId));
          }}
          className="rounded-md border border-red-300 px-3 py-1 font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
        >
          Delete request
        </button>
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </section>
  );
}

/** "Delete" on one comment. */
export function DeleteCommentButton({
  commentId,
  authorName,
}: {
  commentId: number;
  authorName: string;
}) {
  const { pending, error, run } = useAdminAction();

  return (
    <>
      <button
        type="button"
        disabled={pending}
        aria-label={`Delete comment by ${authorName}`}
        onClick={() => {
          const sure = window.confirm(
            `Delete this comment by ${authorName}? This can't be undone.`,
          );
          if (sure) run(() => deleteCommentAction(commentId));
        }}
        className="text-xs text-red-700 hover:underline disabled:opacity-60 dark:text-red-400"
      >
        Delete
      </button>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </>
  );
}
