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
