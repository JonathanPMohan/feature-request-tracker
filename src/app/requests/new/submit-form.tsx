"use client";

import { useActionState, useId } from "react";

import { CONNECTION_MESSAGES, isRedirect } from "@/lib/connection";
import { DESCRIPTION_MAX, TITLE_MAX } from "@/lib/request-input";

import { PRIMARY_BUTTON } from "@/app/ui";

import { submitRequest } from "./actions";
import { INITIAL_SUBMIT_STATE, type SubmitState } from "./submit-state";

// The submit form (spec S8, S9).
//
// useActionState runs the server action and keeps what it returns (`state`):
// the field errors and the text that was typed. `pending` is true while the
// action runs, so the button can't be clicked twice.
//
// maxLength and required here are hints for a nicer experience only. The
// action checks everything again on the server.
export function SubmitForm() {
  const [state, formAction, pending] = useActionState(
    submitOrExplain,
    INITIAL_SUBMIT_STATE,
  );

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-5">
      <TextField
        name="title"
        label="Title"
        maxLength={TITLE_MAX}
        error={state.fieldErrors?.title}
        // React resets the form after the action runs, back to each field's
        // defaultValue. Making that the typed text, returned by the action,
        // is what keeps it there after an error (S9).
        defaultValue={state.values?.title}
      />
      <TextField
        name="description"
        label="Description"
        multiline
        maxLength={DESCRIPTION_MAX}
        error={state.fieldErrors?.description}
        defaultValue={state.values?.description}
      />
      {state.message && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className={`self-start ${PRIMARY_BUTTON}`}
      >
        {pending ? "Submitting…" : "Submit request"}
      </button>
    </form>
  );
}

/**
 * The action, plus what happens when it can't reach the server (M10, P1).
 * Without the catch, the error escapes to Next.js, which replaces the page,
 * and everything typed is gone. Instead, the form gets back what was typed
 * and a message, exactly as it does when the server refuses.
 */
async function submitOrExplain(
  previous: SubmitState,
  form: FormData,
): Promise<SubmitState> {
  try {
    return await submitRequest(previous, form);
  } catch (error) {
    // Success ends in redirect() to the new request, which throws.
    if (isRedirect(error)) throw error;
    return {
      message: CONNECTION_MESSAGES.submit,
      values: {
        title: String(form.get("title") ?? ""),
        description: String(form.get("description") ?? ""),
      },
    };
  }
}

function TextField({
  name,
  label,
  maxLength,
  error,
  defaultValue,
  multiline = false,
}: {
  name: string;
  label: string;
  maxLength: number;
  error?: string;
  defaultValue?: string;
  multiline?: boolean;
}) {
  const errorId = useId();
  const props = {
    name,
    maxLength,
    required: true,
    defaultValue,
    // Links the message to the field, so a screen reader reads it out
    // when the field is focused.
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
    className:
      "rounded-md border border-zinc-300 bg-transparent px-3 py-2 font-normal aria-invalid:border-red-600 dark:border-zinc-700",
  };

  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      {multiline ? <textarea {...props} rows={8} /> : <input {...props} />}
      {error && (
        <span id={errorId} className="text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </label>
  );
}
