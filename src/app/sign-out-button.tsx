"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { CONNECTION_MESSAGES } from "@/lib/connection";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setPending(true);
    setFailed(false);
    // Deletes the session row in the database and clears the cookie, so the
    // old cookie can't be reused even if someone copied it.
    try {
      const { error } = await authClient.signOut();
      if (error) throw error;
    } catch {
      // Offline, or refused (M10, P1): still signed in, so say so, and let
      // the button be pressed again.
      setPending(false);
      setFailed(true);
      return;
    }
    router.refresh();
  }

  return (
    <>
      {failed && (
        <span role="alert" className="text-red-600 dark:text-red-400">
          {CONNECTION_MESSAGES.signOut}
        </span>
      )}
      <button
        type="button"
        onClick={signOut}
        disabled={pending}
        className="hover:underline disabled:opacity-60"
      >
        Sign out
      </button>
    </>
  );
}
