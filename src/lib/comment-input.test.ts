// Unit tests for comment validation (spec C5). The text rules themselves are
// tested in request-input.test.ts; these check the comment's limit and key.
import { describe, expect, it } from "vitest";

import { COMMENT_MAX, parseCommentInput } from "./comment-input";

const key = "0b9a4c3e-6a1f-4d2b-9c8e-7f6a5b4c3d2e";

describe("parseCommentInput", () => {
  it("accepts a comment and returns the cleaned text", () => {
    expect(
      parseCommentInput({
        body: "  +1\r\nWe need this.  ",
        submissionKey: key,
      }),
    ).toEqual({
      success: true,
      data: { body: "+1\nWe need this.", submissionKey: key },
    });
  });

  // Both sides of the limit, matching the database CHECK from M4.
  it(`accepts ${COMMENT_MAX} characters and refuses ${COMMENT_MAX + 1}`, () => {
    expect(
      parseCommentInput({ body: "a".repeat(COMMENT_MAX), submissionKey: key })
        .success,
    ).toBe(true);
    expect(
      parseCommentInput({
        body: "a".repeat(COMMENT_MAX + 1),
        submissionKey: key,
      }),
    ).toEqual({
      success: false,
      bodyError: "Comment can be at most 2,000 characters.",
      badKey: false,
    });
  });

  // The shared text rules apply: invisible-only text is empty.
  it("refuses a comment with nothing visible", () => {
    expect(parseCommentInput({ body: "​ \n", submissionKey: key })).toEqual({
      success: false,
      bodyError: "Comment can't be empty.",
      badKey: false,
    });
  });

  // A hand-made POST can send any key, or none. Postgres `uuid` would
  // refuse these with a database error; the action must refuse them first.
  it.each([
    ["missing", undefined],
    ["not a UUID", "abc"],
    ["a UUID with junk after it", `${key}x`],
    ["a number", 42],
  ])("flags a key that's %s", (_name, submissionKey) => {
    expect(parseCommentInput({ body: "+1", submissionKey })).toEqual({
      success: false,
      bodyError: undefined,
      badKey: true,
    });
  });
});
