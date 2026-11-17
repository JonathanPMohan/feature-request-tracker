import Link from "next/link";

import type { CommentView } from "@/lib/comments";
import { canComment, canDeleteComment } from "@/lib/permissions";
import type { ActionTarget } from "@/lib/requests";
import type { CurrentUser } from "@/lib/session";

import { RequestDate } from "../request-meta";
import { DeleteCommentButton } from "./admin-controls";
import { CommentForm } from "./comment-form";
import { TEXT_LINK } from "@/app/ui";

// A request's conversation (spec C1 to C3): the comments, oldest first, then
// the form, or what to do instead of it.
export function Comments({
  request,
  comments,
  user,
  submissionKey,
}: {
  request: ActionTarget;
  comments: CommentView[];
  user: CurrentUser | null;
  /** The first submission key for the form, made on the server (decision C). */
  submissionKey: string;
}) {
  return (
    <section aria-labelledby="comments-heading" className="mt-12">
      <h2 id="comments-heading" className="text-xl font-semibold">
        Comments ({comments.length})
      </h2>

      {comments.length === 0 ? (
        // P5: an empty conversation invites the first comment.
        <p className="mt-4 text-zinc-600 dark:text-zinc-400">
          No comments yet. Questions, use cases and objections all help decide
          what gets built.
        </p>
      ) : (
        <ol aria-label="Comments" className="mt-4 flex flex-col gap-6">
          {comments.map((comment) => (
            <li key={comment.id}>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {comment.authorName}
                </span>{" "}
                on <RequestDate date={comment.createdAt} />{" "}
                {/* A1: admins only. The action checks again (A2). */}
                {canDeleteComment(user) && (
                  <DeleteCommentButton
                    commentId={comment.id}
                    authorName={comment.authorName}
                  />
                )}
              </p>
              {/* Text, never HTML (C2). React escapes it; whitespace-pre-line
                  keeps the author's line breaks. */}
              <p className="mt-1 whitespace-pre-line break-words">
                {comment.body}
              </p>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-8">
        {/* What the form LOOKS like follows Jonathan's canComment. The action
            asks canComment again on every comment, so this is a convenience. */}
        {canComment(user, request) ? (
          <CommentForm requestId={request.id} submissionKey={submissionKey} />
        ) : user === null ? (
          <p className="text-zinc-600 dark:text-zinc-400">
            <Link href="/sign-in" className={TEXT_LINK}>
              Sign in to comment
            </Link>
          </p>
        ) : (
          <p className="text-zinc-600 dark:text-zinc-400">
            {user.isDemo
              ? "The demo account can't comment. Sign up to join the conversation."
              : "You can't comment on this request."}
          </p>
        )}
      </div>
    </section>
  );
}
