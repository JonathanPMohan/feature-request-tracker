// npm run make-admin <email>
//
// Promotes an existing account to admin. There's no admin UI in v1 (see
// docs/PLAN.md); promoting someone means running this against the database
// you want to change (DATABASE_URL).
import { db } from "@/db";
import { makeAdmin, type MakeAdminResult } from "@/lib/make-admin";

const MESSAGES: Record<MakeAdminResult, string> = {
  promoted: "is now an admin.",
  "already-admin": "is already an admin. Nothing changed.",
  "not-found": "has no account. They need to sign up first.",
  "refused-demo": "is the demo account, which can never be an admin.",
};

// Exit code 0 means "the account is an admin now", so other tools (and CI)
// can tell success from failure.
const SUCCESS: MakeAdminResult[] = ["promoted", "already-admin"];

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npm run make-admin <email>");
    return 2;
  }

  const result = await makeAdmin(email);
  const ok = SUCCESS.includes(result);
  (ok ? console.log : console.error)(`${email} ${MESSAGES[result]}`);
  return ok ? 0 : 1;
}

main()
  .then((code) => (process.exitCode = code))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  // Close the connection pool, or Node waits for it and never exits.
  .finally(() => db.$client.end());
