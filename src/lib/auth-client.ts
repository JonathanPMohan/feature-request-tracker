import { createAuthClient } from "better-auth/react";

// Better Auth's browser client. The sign-up, sign-in and sign-out forms use it
// to call the HTTP endpoints at /api/auth/*.
//
// Why not server actions? Better Auth's protections (the origin check and the
// rate limiter) run only on HTTP requests to /api/auth/*. Calling `auth.api`
// from a server action skips them, and the HTTP endpoints would still be
// public: two ways in, only one protected. With the client, there's one way in.
//
// No baseURL: requests go to /api/auth on whatever site the page came from, so
// localhost, every Vercel preview, and production all work unchanged.
export const authClient = createAuthClient();
