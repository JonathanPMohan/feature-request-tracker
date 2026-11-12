import Link from "next/link";
import { Suspense } from "react";

import { pageNumbers, parsePageParam } from "@/lib/pagination";
import {
  listRequests,
  parseStatusFilter,
  STATUS_LABELS,
  STATUSES,
  type StatusFilter,
} from "@/lib/requests";

import { RequestDate, StatusBadge, VoteCount } from "./requests/request-meta";

// The board (spec S1 to S4). Anyone can see it, signed in or not.
//
// The heading and intro are static, so they're in the prerendered shell and
// show instantly. The list depends on the URL and the database, so it renders
// per request, inside <Suspense> (required with cacheComponents).
export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">
          Feature Requests
        </h1>
        <Link
          href="/requests/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Submit a request
        </Link>
      </div>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        Suggest features, vote on what matters, and follow what is planned.
      </p>
      <Suspense
        fallback={<p className="mt-8 text-zinc-500">Loading requests…</p>}
      >
        <Board searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "Active" },
  ...STATUSES.map((status) => ({
    value: status,
    label: STATUS_LABELS[status],
  })),
  { value: "all", label: "All" },
];

/**
 * The URL for a filter and page. Defaults are left out, so the plain board is
 * just "/", and each view has exactly one URL.
 */
function boardHref(filter: StatusFilter, page: number) {
  const params = new URLSearchParams();
  if (filter !== "active") params.set("status", filter);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

async function Board({
  searchParams,
}: {
  searchParams: PageProps<"/">["searchParams"];
}) {
  const params = await searchParams;
  // URLs are user input: anything odd falls back to the default (S3, S4).
  const filter = parseStatusFilter(params.status);
  const page = parsePageParam(params.page);
  const { requests, totalPages } = await listRequests({ filter, page });

  return (
    <>
      <nav aria-label="Filter by status" className="mt-8">
        <ul className="flex flex-wrap gap-2 text-sm">
          {FILTERS.map(({ value, label }) => (
            <li key={value}>
              {/* A new filter starts again at page 1 (S4). */}
              <Link
                href={boardHref(value, 1)}
                aria-current={value === filter ? "page" : undefined}
                className="rounded-full border border-zinc-300 px-3 py-1 hover:bg-zinc-100 aria-[current=page]:border-zinc-900 aria-[current=page]:bg-zinc-900 aria-[current=page]:text-white dark:border-zinc-700 dark:hover:bg-zinc-800 dark:aria-[current=page]:border-zinc-100 dark:aria-[current=page]:bg-zinc-100 dark:aria-[current=page]:text-zinc-900"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {requests.length === 0 ? (
        <EmptyBoard pastTheEnd={page > totalPages} filter={filter} />
      ) : (
        <ol
          aria-label="Requests"
          className="mt-6 divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800"
        >
          {requests.map((request) => (
            <li key={request.id} className="flex flex-col gap-1 py-4">
              <Link
                href={`/requests/${request.id}`}
                className="font-medium hover:underline"
              >
                {request.title}
              </Link>
              <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                <StatusBadge status={request.status} />
                <VoteCount votes={request.votes} />
                <RequestDate date={request.createdAt} />
              </div>
            </li>
          ))}
        </ol>
      )}

      {totalPages > 1 && (
        <Pagination filter={filter} page={page} totalPages={totalPages} />
      )}
    </>
  );
}

function EmptyBoard({
  pastTheEnd,
  filter,
}: {
  pastTheEnd: boolean;
  filter: StatusFilter;
}) {
  return (
    <p className="mt-8 text-zinc-600 dark:text-zinc-400">
      {pastTheEnd ? (
        <>
          There&apos;s nothing on this page.{" "}
          <Link href={boardHref(filter, 1)} className="underline">
            Go to page 1
          </Link>
        </>
      ) : (
        "No requests here yet."
      )}
    </p>
  );
}

function Pagination({
  filter,
  page,
  totalPages,
}: {
  filter: StatusFilter;
  page: number;
  totalPages: number;
}) {
  const linkClass =
    "rounded-md px-3 py-1 hover:bg-zinc-100 aria-[current=page]:bg-zinc-900 aria-[current=page]:text-white dark:hover:bg-zinc-800 dark:aria-[current=page]:bg-zinc-100 dark:aria-[current=page]:text-zinc-900";

  return (
    <nav aria-label="Pages" className="mt-6">
      <ul className="flex flex-wrap items-center gap-1 text-sm">
        {page > 1 && (
          <li>
            <Link href={boardHref(filter, page - 1)} className={linkClass}>
              Previous
            </Link>
          </li>
        )}
        {pageNumbers(page, totalPages).map((n, i) =>
          n === "gap" ? (
            // aria-hidden: "…" means nothing read aloud, and the page links
            // either side already say where you are.
            <li key={`gap-${i}`} aria-hidden className="px-1 text-zinc-500">
              …
            </li>
          ) : (
            <li key={n}>
              {/* Page links keep the current filter (S4). */}
              <Link
                href={boardHref(filter, n)}
                aria-current={n === page ? "page" : undefined}
                aria-label={`Page ${n}`}
                className={linkClass}
              >
                {n}
              </Link>
            </li>
          ),
        )}
        {page < totalPages && (
          <li>
            <Link href={boardHref(filter, page + 1)} className={linkClass}>
              Next
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
