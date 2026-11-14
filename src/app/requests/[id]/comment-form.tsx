"use client";

import { useActionState, useId } from "react";

import { COMMENT_MAX } from "@/lib/comment-input";

import { addCommentAction } from "./comment-action";

// The comment form (spec C3, C6, decision C).
//
// useActionState runs the action and keeps what it returns. After a save,
// React resets the form, and with no `body` returned, the box is empty. After
// a refusal, `body` comes back as the box's defaultValue, so nothing typed is
// lost (the same idea as M5's submit form).
export function CommentForm({
  requestId,
  submissionKey: firstKey,
}: {
  requestId: number;
  submissionKey: string;
}) {
  const [state, formAction, pending] = useActionState(addCommentAction, {});
  const errorId = useId();

  // Decision C: the key this comment is sent with. The first one comes from
  // the server with the page. After that, every answer says which key to
  // send next: the same one after a refusal (a retry is the same comment),
  // a new one after a save. It's never made in the browser, so the server's
  // HTML and the browser always agree on it.
  const submissionKey = state.submissionKey ?? firstKey;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="submissionKey" value={submissionKey} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Add a comment
        <textarea
          name="body"
          rows={4}
          required
          maxLength={COMMENT_MAX}
          defaultValue={state.body}
          aria-invalid={state.bodyError ? true : undefined}
          aria-describedby={state.bodyError ? errorId : undefined}
          className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 font-normal aria-invalid:border-red-600 dark:border-zinc-700"
        />
        {state.bodyError && (
          <span id={errorId} className="text-red-600 dark:text-red-400">
            {state.bodyError}
          </span>
        )}
      </label>
      {state.message && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        // Disabled while sending, so a double-click sends once. The key is
        // what makes it safe when it doesn't (decision C).
        disabled={pending}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "Posting…" : "Post comment"}
      </button>
    </form>
  );
}
