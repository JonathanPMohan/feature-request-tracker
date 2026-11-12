"use client";

import { useActionState, useId } from "react";

import { DESCRIPTION_MAX, TITLE_MAX } from "@/lib/request-input";

import { submitRequest } from "./actions";
import { INITIAL_SUBMIT_STATE } from "./submit-state";

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
    submitRequest,
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
        className="self-start rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "Submitting…" : "Submit request"}
      </button>
    </form>
  );
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
