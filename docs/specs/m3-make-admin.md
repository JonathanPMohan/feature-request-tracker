# Spec: who may become an admin (M3 step 6)

**Owner:** Jonathan writes `canBecomeAdmin`. Claude wrote everything around it, including the tests.

## The rule

From `docs/PLAN.md`: **the demo account can never be an admin.** Both the script and the database must refuse it.

- The database half is already done: your CHECK `user_demo_not_admin` (step 3).
- This step is the script half: a permission check the `make-admin` script asks before it changes anything.

## What to write

In `src/lib/permissions.ts`, replace the body of `canBecomeAdmin` (the signature is already there):

```ts
export function canBecomeAdmin(user: {
  role: "user" | "admin";
  isDemo: boolean;
}): boolean;
```

| Account                     | Result                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------- |
| Normal user                 | `true`                                                                             |
| Demo account                | `false`                                                                            |
| Already an admin (not demo) | `true`. Promoting again changes nothing, and the script reports "already an admin" |

Keep it a plain function of its input: no database, no imports. That's what makes it a unit-testable permission check.

## How it's used

`src/lib/make-admin.ts` loads the account, calls your check, and only then updates the role. If your check ever had a bug, the database CHECK still refuses the demo.

## Tests (already written)

| File                             | Runs with                  | Covers                                                                 |
| -------------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| `src/lib/permissions.test.ts`    | `npm run test:unit`        | Your function, directly: the 3 rows above                              |
| `src/lib/make-admin.int.test.ts` | `npm run test:integration` | The script's logic against a real database, including the demo refusal |

They fail with "Not implemented yet" until you write the function. When they pass, try it for real:

```
npm run db:seed-demo
npm run make-admin demo@example.com   # refused
npm run make-admin <your email>       # promoted (sign up first)
```
