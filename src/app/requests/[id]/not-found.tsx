import Link from "next/link";

import { PRIMARY_BUTTON } from "@/app/ui";

// A request that doesn't exist (M10, P3): never existed, or since M8, was
// deleted by an admin. Both look the same from here, so it says both.
//
// It replaces the whole request page (Next.js puts this boundary around
// page.tsx), so it has its own <main>. The page has already started
// streaming when it finds out, so the answer is 200, not 404, with a
// noindex tag (see page.tsx).
export default function RequestNotFound() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Request not found
      </h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        This request doesn&apos;t exist, or it was deleted.
      </p>
      <div className="mt-8 flex justify-center">
        <Link href="/" className={PRIMARY_BUTTON}>
          All requests
        </Link>
      </div>
    </main>
  );
}
