# Spec: user roles and the demo account (M3 step 3)

**Owner:** Jonathan, who writes the design and implementation. Claude writes the example tests and reviews.

## Rules your design must satisfy

| #   | Rule                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Every user has a `role` column whose value is exactly `'user'` or `'admin'`. It is never null.                                                                  |
| R2  | A new account is `'user'`, **no matter how it's created**: sign-up, a seed script, or a raw SQL insert.                                                         |
| R3  | **No API request can set `role`:** not sign-up, and not "update my profile". Anything the server owns must be unreachable from request input (mass assignment). |
| R4  | The **database** rejects any other role value, even from code that bypasses the app.                                                                            |
| R5  | The **database** refuses to let the demo account have `role = 'admin'`, however that's attempted: insert, update, or the `make-admin` script.                   |
| R6  | Any non-demo account _can_ become `'admin'`. Don't over-constrain.                                                                                              |

Rules marked **database** must hold even if the app code has a bug. That's the point of putting them in Postgres.

## Where your code goes

Better Auth owns the `user` table definition, which is generated into `src/db/auth-schema.ts`. **Don't edit that file**, because `npm run auth:generate` overwrites it. Instead:

1. **Declare the field to Better Auth** in `src/lib/auth-options.ts`, under `user.additionalFields`. This is what R3 depends on (`input: false`).
   ```ts
   user: {
     additionalFields: {
       role: { type: /* ... */, input: false, /* defaultValue? required? */ },
     },
   },
   ```
2. **Regenerate the table:** `npm run auth:generate`. The column then appears in `auth-schema.ts`.
3. **Create the column:** `npm run db:generate -- --name <name>` writes the migration. Read the SQL.
4. **Write the constraints Better Auth can't express** (R2's database default, R4, R5) as a hand-written SQL migration:
   ```
   npm run db:generate -- --custom --name <name>
   ```
   This creates an empty `.sql` file in `drizzle/` for you to fill in. Hand-written migrations for database rules an ORM can't model are a normal, real-world pattern.
5. **Apply:** `npm run db:migrate`. The integration tests apply migrations to the test database automatically.

## Decisions (yours)

### A. How to store `role`

| Option                                             | Pros                                                                                                      | Cons                                                                                                                                            |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Postgres enum** (`create type role as enum ...`) | The column type itself restricts values, and it's self-documenting                                        | Adding a value is easy; removing or renaming one is painful. The generator emits `text`, so you'd also change the column type in your migration |
| **`text` + `CHECK (role in ('user','admin'))`**    | Simple. Matches the generated `text` column. To change the allowed values, drop and re-add one constraint | The allowed values live in a constraint rather than the type                                                                                    |
| **`boolean is_admin`**                             | Simplest                                                                                                  | Doesn't satisfy R1 as written, and can't grow (e.g. a future `'moderator'`)                                                                     |

### B. How the database knows which account is the demo

| Option                                                                                                 | Pros                                           | Cons                                                                         |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| **A flag column** (e.g. `is_demo boolean not null default false`) + a `CHECK` combining it with `role` | Explicit, and independent of the email address | One more column, which needs the same R3 protection as `role`                |
| **A `CHECK` on the email** (`email <> 'demo@…' or role <> 'admin'`)                                    | No new column                                  | Hard-codes an email in the schema; changing the demo email needs a migration |
| **A trigger**                                                                                          | Most flexible                                  | Most complex; overkill here                                                  |

## Tests

- **Example tests (Claude):** `src/lib/auth-roles.int.test.ts` covers R1/R2 via sign-up, R3 for sign-up, and R4. They **fail until you implement the design**. That's the point: they're the spec, written as code.
- **Your tests:** add to the same file. Cover the rules the examples don't, especially R5 and R6, and anything else your design needs. After review, Claude will point out important missing cases without writing them for you.
- **Run:** `npm run test:integration`. Your local Postgres must be running.
