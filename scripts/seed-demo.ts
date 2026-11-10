// npm run db:seed-demo
//
// Makes sure the demo account exists. Runs on every Vercel deploy, after the
// migrations (vercel.json), and is safe to run again at any time.
import { db } from "@/db";
import { DEMO_ACCOUNT } from "@/lib/demo-account";
import { seedDemoAccount } from "@/lib/seed-demo";

seedDemoAccount()
  .then((result) => {
    console.log(
      result === "created"
        ? `Created the demo account (${DEMO_ACCOUNT.email}).`
        : `The demo account (${DEMO_ACCOUNT.email}) already exists.`,
    );
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  // Close the connection pool, or Node waits for it and never exits.
  .finally(() => db.$client.end());
