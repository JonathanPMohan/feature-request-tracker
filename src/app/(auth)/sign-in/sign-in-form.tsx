"use client";

import { authClient } from "@/lib/auth-client";

import { AuthForm, Field } from "../auth-form";

export function SignInForm() {
  return (
    <AuthForm
      submitLabel="Sign in"
      pendingLabel="Signing in…"
      onSubmit={(form) =>
        authClient.signIn.email({
          email: String(form.get("email")),
          password: String(form.get("password")),
        })
      }
    >
      <Field label="Email" name="email" type="email" autoComplete="email" />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
      />
    </AuthForm>
  );
}
