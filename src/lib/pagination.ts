/**
 * Turns the `?page=` value from the URL into a page number we can safely use.
 *
 * URLs are user input, so anything that isn't a whole number of 1 or more
 * falls back to page 1 instead of causing an error.
 *
 * Next.js gives us each search param as `string | string[] | undefined`:
 * - undefined when it's missing (`/requests`)
 * - a string normally (`/requests?page=2`)
 * - an array when it's repeated (`/requests?page=2&page=5`)
 */
export function parsePageParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;

  // Digits only: rejects "-2", "2.5", "abc", "", " 3", and "1e3".
  if (raw === undefined || !/^\d+$/.test(raw)) return 1;

  const page = Number(raw);

  // Rejects "0" and numbers too large to represent exactly.
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

/**
 * Which page numbers to show: the first, the last, and two either side of
 * the current one, with "gap" where pages are left out. For page 10 of 50:
 *
 *   1 … 8 9 10 11 12 … 50
 *
 * A link for every page would put 500 links on the board at 10,000
 * requests, and Next.js prefetches links as they scroll into view.
 * (Found by /code-review.)
 */
export function pageNumbers(
  current: number,
  totalPages: number,
): (number | "gap")[] {
  const shown = new Set([1, totalPages]);
  for (let n = current - 2; n <= current + 2; n++) {
    if (n >= 1 && n <= totalPages) shown.add(n);
  }

  const sorted = [...shown].sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  for (const n of sorted) {
    const previous = result.at(-1);
    // A gap of exactly one page shows that page instead of "…": "1 … 3"
    // would hide a single page behind a symbol that takes the same space.
    if (typeof previous === "number" && n - previous === 2) result.push(n - 1);
    else if (typeof previous === "number" && n - previous > 2)
      result.push("gap");
    result.push(n);
  }
  return result;
}
