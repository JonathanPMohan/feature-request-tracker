"use client";

import "./globals.css";

import { PRIMARY_BUTTON } from "@/app/ui";

// The last resort (M10, P2): an error in the root layout itself, where
// error.tsx can't help because it lives inside that layout. This replaces
// the whole document, so it brings its own <html>, <body> and styles, and
// can't use the layout's header or fonts. Rare: the layout only renders the
// header, whose one dynamic part has its own <Suspense>.
//
// Same rules as error.tsx: no error details, a reference code, and retry().
export default function GlobalError({
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
    <html lang="en">
      <body className="font-sans antialiased">
        {/* No `metadata` export in an error component, so the title is set
            directly (Next.js docs: global-error). */}
        <title>Something went wrong · Feature Requests</title>
        <main className="mx-auto w-full max-w-xl px-4 py-16 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Something went wrong
          </h1>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            The app couldn&apos;t load. Trying again usually works.
          </p>
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => retry()}
              className={PRIMARY_BUTTON}
            >
              Try again
            </button>
          </div>
          {reference && (
            <p className="mt-10 text-xs text-zinc-500">
              If it keeps happening, mention this code:{" "}
              <code className="font-mono">{reference}</code>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
