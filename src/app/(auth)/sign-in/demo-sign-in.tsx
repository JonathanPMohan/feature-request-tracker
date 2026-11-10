"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { DEMO_ACCOUNT } from "@/lib/demo-account";

// Lets a reviewer try the app in one click. The details are shown too, so it's
// clear this is a shared account and anyone can use it.
export function DemoSignIn() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signInAsDemo() {
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.email({
      email: DEMO_ACCOUNT.email,
      password: DEMO_ACCOUNT.password,
    });
    setPending(false);

    if (error) {
      setError(error.message ?? "Something went wrong. Please try again.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <section
      aria-labelledby="demo-heading"
      className="mt-8 rounded-md border border-zinc-200 p-4 text-sm dark:border-zinc-800"
    >
      <h2 id="demo-heading" className="font-medium">
        Just looking?
      </h2>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">
        Use the shared demo account: <code>{DEMO_ACCOUNT.email}</code> /{" "}
        <code>{DEMO_ACCOUNT.password}</code>
      </p>
      {error && (
        <p role="alert" className="mt-2 text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={signInAsDemo}
        disabled={pending}
        className="mt-3 rounded-md border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        {pending ? "Signing in…" : "Sign in as the demo user"}
      </button>
    </section>
  );
}
