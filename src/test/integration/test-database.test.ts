import { describe, expect, it } from "vitest";

import { assertTestDatabase } from "./test-database";

const local = (name: string) =>
  `postgres://postgres:postgres@127.0.0.1:5432/${name}`;

describe("assertTestDatabase", () => {
  it("accepts a database whose name ends in _test", () => {
    const url = local("feature_requests_test");
    expect(assertTestDatabase(url)).toBe(url);
  });

  it("accepts a test database URL with query parameters", () => {
    const url = `${local("feature_requests_test")}?sslmode=require`;
    expect(assertTestDatabase(url)).toBe(url);
  });

  it("refuses when no URL is set", () => {
    expect(() => assertTestDatabase(undefined)).toThrow(/not set/);
    expect(() => assertTestDatabase("")).toThrow(/not set/);
  });

  // The dangerous near-misses: real data that must never be wiped.
  it.each([
    ["feature_requests_dev", "the dev database"],
    ["neondb", "Neon's production database"],
    ["my_test_data", "_test in the middle, not at the end"],
    ["feature_requests_TEST", "different case"],
  ])("refuses %j (%s)", (name) => {
    expect(() => assertTestDatabase(local(name))).toThrow(/Refusing/);
  });
});
