"use client";

import { useRouter } from "next/navigation";
import {
  useState,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";

// What a submit returns: Better Auth's client gives back { error } on failure
// instead of throwing, so the form can show the message.
type SubmitResult = { error?: { message?: string } | null };

// The shared shell for the sign-up and sign-in forms: submit handling, the
// pending state, the error message, and where to go on success.
export function AuthForm({
  submitLabel,
  pendingLabel,
  onSubmit,
  children,
}: {
  submitLabel: string;
  pendingLabel: string;
  onSubmit: (form: FormData) => Promise<SubmitResult>;
  children: ReactNode;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Stop the browser's own form submission; the client sends JSON instead.
    event.preventDefault();
    // Keep a reference: React clears `event.currentTarget` after an `await`.
    const form = event.currentTarget;
    setPending(true);
    setError(null);

    const { error } = await onSubmit(new FormData(form));
    setPending(false);

    if (error) {
      setError(error.message ?? "Something went wrong. Please try again.");
      return;
    }
    // With cacheComponents, Next.js keeps a page we leave mounted but hidden,
    // to restore it instantly on "back". Clear the form so the password isn't
    // left sitting in the page, and the next visit starts fresh.
    form.reset();
    // The session cookie is set now. `refresh` re-renders the server
    // components (like the header) so they see the signed-in user.
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
      {children}
      {error && (
        // role="alert" makes screen readers announce the message.
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}

export function Field({
  label,
  ...input
}: { label: string } & ComponentProps<"input">) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <input
        {...input}
        required
        className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 font-normal dark:border-zinc-700"
      />
    </label>
  );
}
