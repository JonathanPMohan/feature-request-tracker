// What the admin actions return (spec M8). Outside the actions' file because
// a "use server" file may only export async functions.

export type AdminResult = { ok: true } | { ok: false; message: string };

export const ADMIN_MESSAGES = {
  notAllowed: "Only admins can do that.",
  // A7: also the answer to a second delete (another admin, a double-click).
  requestGone: "This request doesn't exist anymore. It may have been deleted.",
  commentGone: "This comment doesn't exist anymore. It may have been deleted.",
  invalidStatus: "That isn't a status. Reload the page and try again.",
} as const;
