import type { Metadata } from "next";
import Link from "next/link";

import { DemoSignIn } from "./demo-sign-in";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · Feature Requests" };

export default function SignInPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <SignInForm />
      <DemoSignIn />
      <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        New here?{" "}
        <Link href="/sign-up" className="underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}
