"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { deleteComment } from "@/lib/comments";
import {
  deleteRequest,
  isStatus,
  setStatus,
  toRequestId,
} from "@/lib/requests";
import {
  canChangeStatus,
  canDeleteComment,
  canDeleteRequest,
} from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

import { ADMIN_MESSAGES, type AdminResult } from "./admin-state";

// SECURITY: every export here is a public POST endpoint, like every action
// (M6's walkthrough). These ones change or delete other people's content, so
// each checks for an admin itself, on every call. The buttons only appear
// for admins, but that's a convenience, not the protection.
//
// Steps, in PLAN.md's order: who is this → are they allowed → is the input
// valid → save. No rate limit step (spec: "Not rate-limited").

/** Sets a request's status (spec A2, A3; Jonathan's decision A: any to any). */
export async function setStatusAction(
  requestId: unknown,
  status: unknown,
): Promise<AdminResult> {
  // ── Step 1: who is this? ────────────────────────────────────────────────
  const user = await getCurrentUser();

  // ── Step 2: are they allowed? ───────────────────────────────────────────
  if (!canChangeStatus(user)) {
    return { ok: false, message: ADMIN_MESSAGES.notAllowed };
  }

  // ── Step 3: is the input valid? ─────────────────────────────────────────
  const id = toRequestId(requestId);
  if (id === null) return { ok: false, message: ADMIN_MESSAGES.requestGone };
  // Checked here, so a bad status gets a message instead of the database's
  // CHECK error (A3).
  if (!isStatus(status)) {
    return { ok: false, message: ADMIN_MESSAGES.invalidStatus };
  }

  // ── Step 4: save ────────────────────────────────────────────────────────
  // A plain UPDATE. If a vote holds the request's lock at this moment, the
  // update waits for it (issue #14): see withRequestLocked.
  if (!(await setStatus(id, status))) {
    return { ok: false, message: ADMIN_MESSAGES.requestGone };
  }
  // The board filters and orders by status, and the request's page shows it.
  revalidatePath("/");
  revalidatePath(`/requests/${id}`);
  return { ok: true };
}

/**
 * Deletes a request, with its votes and comments (A4), then sends the admin
 * to the board: the request's page no longer exists.
 */
export async function deleteRequestAction(
  requestId: unknown,
): Promise<AdminResult> {
  // ── Step 1: who is this? ────────────────────────────────────────────────
  const user = await getCurrentUser();

  // ── Step 2: are they allowed? ───────────────────────────────────────────
  if (!canDeleteRequest(user)) {
    return { ok: false, message: ADMIN_MESSAGES.notAllowed };
  }

  // ── Step 3: is the input valid? ─────────────────────────────────────────
  const id = toRequestId(requestId);
  if (id === null) return { ok: false, message: ADMIN_MESSAGES.requestGone };

  // ── Step 4: save ────────────────────────────────────────────────────────
  // Already gone (a second admin, a double-click) is a message, not an
  // error (A7).
  if (!(await deleteRequest(id))) {
    return { ok: false, message: ADMIN_MESSAGES.requestGone };
  }
  revalidatePath("/");
  // Throws a special error that Next.js turns into a redirect, so it's the
  // last line: nothing after it runs.
  redirect("/");
}

/** Deletes one comment (A5). */
export async function deleteCommentAction(
  commentId: unknown,
): Promise<AdminResult> {
  // ── Step 1: who is this? ────────────────────────────────────────────────
  const user = await getCurrentUser();

  // ── Step 2: are they allowed? ───────────────────────────────────────────
  if (!canDeleteComment(user)) {
    return { ok: false, message: ADMIN_MESSAGES.notAllowed };
  }

  // ── Step 3: is the input valid? ─────────────────────────────────────────
  // Comment ids are the same kind of integer as request ids (M4, decision A).
  const id = toRequestId(commentId);
  if (id === null) return { ok: false, message: ADMIN_MESSAGES.commentGone };

  // ── Step 4: save ────────────────────────────────────────────────────────
  const requestId = await deleteComment(id);
  if (requestId === null) {
    return { ok: false, message: ADMIN_MESSAGES.commentGone };
  }
  revalidatePath(`/requests/${requestId}`);
  return { ok: true };
}
