"use client";

import { authClient } from "@/lib/auth-client";

import { AuthForm, Field } from "../auth-form";

export function SignUpForm() {
  return (
    <AuthForm
      submitLabel="Create account"
      pendingLabel="Creating account…"
      onSubmit={(form) =>
        authClient.signUp.email({
          name: String(form.get("name")),
          email: String(form.get("email")),
          password: String(form.get("password")),
        })
      }
    >
      <Field label="Name" name="name" autoComplete="name" />
      <Field label="Email" name="email" type="email" autoComplete="email" />
      {/* Better Auth enforces 8 to 128 characters on the server. These
          attributes only give faster feedback; they aren't the rule. */}
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={128}
      />
    </AuthForm>
  );
}
