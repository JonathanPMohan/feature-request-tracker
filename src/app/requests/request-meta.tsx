import { STATUS_LABELS, type Status } from "@/lib/requests";

// Small pieces shared by the board and the request page.

const STATUS_STYLES: Record<Status, string> = {
  open: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  planned: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  in_progress:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  shipped:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  declined: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

// The text says the status, so color is never the only signal (accessibility).
export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function VoteCount({ votes }: { votes: number }) {
  return (
    <span className="tabular-nums">
      {votes} {votes === 1 ? "vote" : "votes"}
    </span>
  );
}

// Dates are formatted on the server, in UTC, so every visitor sees the same
// date and the HTML never depends on the server's own time zone.
export function RequestDate({ date }: { date: Date }) {
  return (
    <time dateTime={date.toISOString()}>
      {date.toLocaleDateString("en-US", {
        dateStyle: "medium",
        timeZone: "UTC",
      })}
    </time>
  );
}
