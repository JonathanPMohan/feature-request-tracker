// The shared demo account, shown on the sign-in page so reviewers can try the
// app without signing up.
//
// The password is public on purpose, so it isn't a secret and can live in the
// code. What keeps the account safe is what it can't do:
// - become an admin (a database CHECK, plus canBecomeAdmin in permissions.ts)
// - change its password, name or sessions (disabledPaths in auth-options.ts)
export const DEMO_ACCOUNT = {
  name: "Demo User",
  email: "demo@example.com",
  password: "try-the-demo-board",
} as const;
