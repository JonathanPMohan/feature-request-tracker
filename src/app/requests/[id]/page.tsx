import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { getRequest, parseRequestId } from "@/lib/requests";

import { RequestDate, StatusBadge, VoteCount } from "../request-meta";

// One request (spec S5, S6).
//
// ABOUT 404s: the root layout's header is prerendered, so every page starts
// streaming at once, with a "200 OK" status. By the time this page knows the
// request doesn't exist, the status can't change anymore. notFound() still
// shows the not-found page and adds <meta name="robots" content="noindex">,
// so search engines skip it (Next.js docs: Streaming → Status codes). We
// checked: `export const instant = false` doesn't change this, because the
// layout's shell is sent first either way.
export default function RequestPage({ params }: PageProps<"/requests/[id]">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <Link
        href="/"
        className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
      >
        ← All requests
      </Link>
      <Suspense fallback={<p className="mt-4 text-zinc-500">Loading…</p>}>
        <RequestDetails params={params} />
      </Suspense>
    </main>
  );
}

async function RequestDetails({
  params,
}: {
  params: PageProps<"/requests/[id]">["params"];
}) {
  const { id } = await params;
  // "abc", "0" and "99999999999" can't be ids: not found, without asking the
  // database (the last one would be a database error otherwise).
  const requestId = parseRequestId(id);
  if (requestId === null) notFound();

  const request = await getRequest(requestId);
  if (!request) notFound();

  return (
    <article>
      {/* break-words: a 120-character word must not overflow on a phone. */}
      <h1 className="mt-4 break-words text-3xl font-semibold tracking-tight">
        {request.title}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
        <StatusBadge status={request.status} />
        <VoteCount votes={request.votes} />
        <span>
          by {request.authorName} on <RequestDate date={request.createdAt} />
        </span>
      </div>
      {/* React escapes text, so a description containing <script> shows as
          those characters and never runs (S6). whitespace-pre-line keeps the
          author's line breaks without needing any HTML. */}
      <p className="mt-6 whitespace-pre-line break-words">
        {request.description}
      </p>
    </article>
  );
}
