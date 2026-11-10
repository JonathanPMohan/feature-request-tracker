// Every Better Auth endpoint lives under /api/auth/*, e.g. POST /api/auth/sign-up/email.
// The catch-all [...all] folder sends all of them to Better Auth's own router.
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
