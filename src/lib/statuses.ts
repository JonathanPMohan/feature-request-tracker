// The five statuses, their labels, and which ones are active.
//
// Plain data, with no database access, so both server code and client
// components (M8's status menu) can import it. requests.ts is server-only,
// because it talks to the database, so a client component can't import
// anything from it; it re-exports these for server code.
//
// Must match Jonathan's CHECK on feature_request.status: a test in
// requests.int.test.ts reads the CHECK and compares (M5).

export const STATUSES = [
  "open",
  "planned",
  "in_progress",
  "shipped",
  "declined",
] as const;
export type Status = (typeof STATUSES)[number];

/** What the board shows with no filter (M5 decision A). */
export const ACTIVE_STATUSES: readonly Status[] = [
  "open",
  "planned",
  "in_progress",
];

export const STATUS_LABELS: Record<Status, string> = {
  open: "Open",
  planned: "Planned",
  in_progress: "In progress",
  shipped: "Shipped",
  declined: "Declined",
};

/** True if `value` is one of the five statuses (M8, A3). */
export function isStatus(value: unknown): value is Status {
  return (STATUSES as readonly unknown[]).includes(value);
}
