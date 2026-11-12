import { describe, expect, it } from "vitest";

import { pageNumbers, parsePageParam } from "./pagination";

describe("parsePageParam", () => {
  it("defaults to page 1 when there is no page param", () => {
    expect(parsePageParam(undefined)).toBe(1);
  });

  it("reads a valid page number", () => {
    expect(parsePageParam("3")).toBe(3);
  });

  it("uses the first value when the param is repeated", () => {
    expect(parsePageParam(["2", "5"])).toBe(2);
  });

  // One test per row: [input, why it's invalid].
  it.each([
    ["0", "zero"],
    ["-2", "negative"],
    ["2.5", "not a whole number"],
    ["abc", "not a number"],
    ["", "empty"],
    [" 3", "has whitespace"],
    ["1e3", "scientific notation"],
    ["99999999999999999999", "too large to represent exactly"],
  ])("falls back to page 1 for %j (%s)", (input) => {
    expect(parsePageParam(input)).toBe(1);
  });
});

describe("pageNumbers", () => {
  it.each([
    // Few pages: all of them.
    [1, 1, [1]],
    [2, 5, [1, 2, 3, 4, 5]],
    [4, 7, [1, 2, 3, 4, 5, 6, 7]],
    // Many pages: first, last, and two either side of the current one.
    [10, 50, [1, "gap", 8, 9, 10, 11, 12, "gap", 50]],
    [1, 50, [1, 2, 3, "gap", 50]],
    [50, 50, [1, "gap", 48, 49, 50]],
    // A gap of one page shows the page, not "…".
    [5, 50, [1, 2, 3, 4, 5, 6, 7, "gap", 50]],
    [46, 50, [1, "gap", 44, 45, 46, 47, 48, 49, 50]],
  ] as const)("page %i of %i", (current, total, expected) => {
    expect(pageNumbers(current, total)).toEqual(expected);
  });

  // The point of the window: the number of links stays small however many
  // pages there are.
  it("shows at most 9 entries, even with 10,000 pages", () => {
    expect(pageNumbers(5000, 10_000).length).toBeLessThanOrEqual(9);
  });

  // A page past the end (allowed: it shows the empty state) still gets
  // links back to real pages, and none past the end.
  it("handles a current page past the end", () => {
    expect(pageNumbers(99, 3)).toEqual([1, 2, 3]);
  });
});
