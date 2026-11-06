import { describe, expect, it } from "vitest";

import { parsePageParam } from "./pagination";

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
