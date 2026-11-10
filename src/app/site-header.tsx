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
        <Link href="/" className="font-semibold">
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
