// Loading placeholders (M10, P4).
//
// Each one is the shape of what's coming, in the same place and about the
// same size, so the page doesn't jump when the real content arrives. Before
// M10, a one-line "Loading…" was replaced by a whole list.
//
// Accessibility:
// - role="status" with one label: a screen reader hears "Loading requests"
//   once, not every grey bar. The bars themselves are aria-hidden.
// - motion-safe: the bars only pulse if the system allows motion. With
//   "reduce motion" on, they stay still.

function Bone({ className }: { className: string }) {
  return (
    <div
      aria-hidden
      className={`rounded-md bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800 ${className}`}
    />
  );
}

function Loading({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-label={label} className={className}>
      {children}
    </div>
  );
}

/** The board: the filter row, then rows of vote box, title, excerpt, meta. */
export function BoardSkeleton() {
  return (
    <Loading label="Loading requests" className="mt-8">
      <div className="flex flex-wrap gap-2">
        {/* Roughly the widths of Active, Open, Planned, In progress,
            Shipped, Declined and All. */}
        {["w-16", "w-14", "w-20", "w-24", "w-20", "w-20", "w-12"].map(
          (w, i) => (
            // A fixed list that never reorders, so its index is a safe key.
            <Bone key={i} className={`h-7 rounded-full ${w}`} />
          ),
        )}
      </div>
      <div className="mt-6 divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-start gap-4 py-4">
            <Bone className="h-12 w-14 shrink-0" />
            <div className="flex flex-1 flex-col gap-2">
              <Bone className="h-4 w-2/3" />
              <Bone className="h-3.5 w-11/12" />
              <Bone className="mt-1 h-4 w-48" />
            </div>
          </div>
        ))}
      </div>
    </Loading>
  );
}

/** A request's page: vote box and title, meta, description, comments. */
export function RequestSkeleton() {
  return (
    <Loading label="Loading request" className="mt-4">
      <div className="flex items-start gap-4">
        <Bone className="h-12 w-14 shrink-0" />
        <Bone className="mt-1 h-8 w-2/3" />
      </div>
      <Bone className="mt-3 h-5 w-56" />
      <div className="mt-6 flex flex-col gap-2">
        <Bone className="h-4 w-full" />
        <Bone className="h-4 w-11/12" />
        <Bone className="h-4 w-3/5" />
      </div>
      <Bone className="mt-12 h-6 w-36" />
      <Bone className="mt-4 h-16 w-full" />
    </Loading>
  );
}

/** The submit form: two fields and a button. */
export function FormSkeleton() {
  return (
    <Loading label="Loading form" className="mt-8 flex flex-col gap-5">
      <Bone className="h-16 w-full" />
      <Bone className="h-48 w-full" />
      <Bone className="h-9 w-36" />
    </Loading>
  );
}
