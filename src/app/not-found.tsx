import type { Metadata } from "next";
import Link from "next/link";

import { PRIMARY_BUTTON } from "@/app/ui";

export const metadata: Metadata = {
  title: "Page not found · Feature Requests",
};

// Any address the app doesn't have (M10, P3). Next.js marks it noindex, so
// search engines don't keep it.
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        There&apos;s no page at this address. It may have been mistyped.
      </p>
      <div className="mt-8 flex justify-center">
        <Link href="/" className={PRIMARY_BUTTON}>
          All requests
        </Link>
      </div>
    </main>
  );
}
