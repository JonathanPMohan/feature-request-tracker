import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/session";

import { SubmitForm } from "./submit-form";

export const metadata: Metadata = {
  title: "Submit a request · Feature Requests",
};

// Spec S7. Sending visitors to sign in is a convenience: it saves them
// filling in a form that would be refused. The real check is in the action,
// which refuses visitors no matter how the POST arrives.
export default function NewRequestPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <SignedInOnly />
      </Suspense>
    </main>
  );
}

// Reads the session cookie, so it must sit inside <Suspense>. The page has
// already started streaming by then, so redirect() arrives as an instruction
// in the stream, which the browser follows, rather than an HTTP 307. Same
// destination; see /requests/[id]/page.tsx for why the status can't change.
async function SignedInOnly() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Submit a request
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Your request starts with your vote.
      </p>
      <SubmitForm />
    </>
  );
}
