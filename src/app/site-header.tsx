import Link from "next/link";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/session";

import { SignOutButton } from "./sign-out-button";

// The header is static except for the account area. Only that part reads the
// session, so only that part waits for the request; the rest is in the
// prerendered shell and shows instantly.
export function SiteHeader() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          {/* The app's icon (app/icon.svg), drawn inline so it needs no
              extra request. Decorative: the name next to it says it all. */}
          <svg aria-hidden viewBox="0 0 32 32" className="size-6">
            <rect width="32" height="32" rx="7" fill="#7cfc00" />
            <path d="M16 7 L26 21 H6 Z" fill="#000" />
            <rect x="6" y="23" width="20" height="3" rx="1.5" fill="#000" />
          </svg>
          Feature Requests
        </Link>
        {/* With cacheComponents, reading cookies outside <Suspense> is a
            build error. The empty fallback avoids a "signed out" flash. */}
        <Suspense fallback={null}>
          <AccountNav />
        </Suspense>
      </div>
    </header>
  );
}

async function AccountNav() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <nav className="flex gap-4 text-sm">
        <Link href="/sign-in" className="hover:underline">
          Sign in
        </Link>
        <Link href="/sign-up" className="hover:underline">
          Sign up
        </Link>
      </nav>
    );
  }

  return (
    <div className="flex items-center gap-4 text-sm">
      <span className="text-zinc-600 dark:text-zinc-400">
        Signed in as <span data-testid="current-user">{user.name}</span>
      </span>
      <SignOutButton />
    </div>
  );
}
