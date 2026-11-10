"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    // Deletes the session row in the database and clears the cookie, so the
    // old cookie can't be reused even if someone copied it.
    await authClient.signOut();
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className="hover:underline disabled:opacity-60"
    >
      Sign out
    </button>
  );
}
