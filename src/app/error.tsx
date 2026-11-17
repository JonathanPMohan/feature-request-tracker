"use client"; // Error pages must be client components (they catch in the browser).

import Link from "next/link";

import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/app/ui";

// The page for an unexpected error (M10, P2), inside the normal layout, so
// the header still works.
//
// It never shows the error's message. In production, Next.js replaces it
// for errors from the server anyway; we don't print it in development
// either, so what you see locally is what visitors see.
//
// Decision C: a small reference code. Next.js gives each server error a
// `digest`, and the same code is in the server's logs (Vercel → Logs), so a
// report that quotes it can be matched to what happened. It's a hash, so it
// reveals nothing itself.
//
// `retry` (Next.js 16) fetches the page again and re-renders it. That's what
// "Try again" should do: most errors here are a database blip, and the old
// `reset` would only re-render what failed, without fetching.
export default function ErrorPage({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const reference =
    error instanceof Error && "digest" in error && error.digest
      ? String(error.digest)
      : null;

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        This page couldn&apos;t be loaded. It&apos;s not something you did;
        trying again usually works.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className={PRIMARY_BUTTON}
        >
          Try again
        </button>
        <Link href="/" className={SECONDARY_BUTTON}>
          All requests
        </Link>
      </div>
      {reference && (
        <p className="mt-10 text-xs text-zinc-500">
          If it keeps happening, mention this code:{" "}
          <code className="font-mono">{reference}</code>
        </p>
      )}
    </main>
  );
}
