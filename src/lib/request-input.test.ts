// Unit tests for request validation (spec S8). No database: these are pure
// functions, so they run on every commit.
import { describe, expect, it } from "vitest";

import {
  characterCount,
  DESCRIPTION_MAX,
  hasVisibleText,
  normalizeText,
  parseRequestInput,
  TITLE_MAX,
} from "./request-input";

const valid = { title: "Dark mode", description: "Please add a dark theme." };

function titleError(title: unknown) {
  const result = parseRequestInput({ ...valid, title });
  return result.success ? null : result.fieldErrors.title;
}

function descriptionError(description: unknown) {
  const result = parseRequestInput({ ...valid, description });
  return result.success ? null : result.fieldErrors.description;
}

describe("normalizeText", () => {
  it("trims surrounding whitespace, including Unicode spaces", () => {
    expect(normalizeText("  Dark mode \u00a0\u3000")).toBe("Dark mode");
  });

  // The textarea trap: browsers submit line breaks as \r\n.
  it("turns every line break into a single \\n", () => {
    expect(normalizeText("one\r\ntwo\rthree\nfour")).toBe(
      "one\ntwo\nthree\nfour",
    );
  });

  it("keeps line breaks inside the text", () => {
    expect(normalizeText("\n\nFirst\n\nSecond\n\n")).toBe("First\n\nSecond");
  });
});

describe("characterCount", () => {
  // Matches Postgres char_length, so the app and database agree on limits.
  it("counts an emoji as one character, like Postgres", () => {
    expect("😀".length).toBe(2); // why this function exists
    expect(characterCount("😀")).toBe(1);
    expect(characterCount("Dark mode 🌙")).toBe(11);
  });
});

describe("hasVisibleText", () => {
  it.each([
    ["spaces", "   "],
    ["tabs and line breaks", "\t\n\r\n"],
    ["non-breaking spaces", "\u00a0\u00a0"],
    ["zero-width spaces", "\u200b\u200b"],
    ["a byte order mark", "\ufeff"],
    ["a soft hyphen", "\u00ad"],
    // Found by /code-review: blank-looking characters that aren't spaces.
    ["Hangul filler characters", "\u3164\u115f\u1160\uffa0"],
    ["the blank braille pattern", "\u2800\u2800"],
    ["variation selectors", "\ufe0f\ufe0e"],
    ["a mix of all of them", " \u200b\u00a0\t\u2060\u3164\u2800"],
  ])("is false for only %s", (_name, text) => {
    expect(hasVisibleText(text)).toBe(false);
  });

  // Control cases: a check that's too strict would refuse real text.
  it.each([
    ["a letter", "x"],
    ["an emoji", "🌙"],
    ["an emoji built with zero-width joiners", "👨‍👩‍👧"],
    // A variation selector alone is invisible, but it's also how many emoji
    // pick their color form. Next to a visible character, it's fine.
    ["an emoji with a variation selector", "\u2764\ufe0f"],
    ["an accented letter", "e\u0301"],
    ["text surrounded by invisible characters", "\u200bDark mode\u200b"],
  ])("is true for %s", (_name, text) => {
    expect(hasVisibleText(text)).toBe(true);
  });
});

describe("parseRequestInput", () => {
  it("accepts a normal request and returns the cleaned text", () => {
    const result = parseRequestInput({
      title: "  Dark mode  ",
      description: "Please.\r\nThanks!",
    });
    expect(result).toEqual({
      success: true,
      data: { title: "Dark mode", description: "Please.\nThanks!" },
    });
  });

  describe("title", () => {
    // Both sides of the limit, after trimming: the spaces don't count.
    it(`accepts ${TITLE_MAX} characters`, () => {
      expect(titleError(` ${"a".repeat(TITLE_MAX)} `)).toBeNull();
    });

    it(`refuses ${TITLE_MAX + 1} characters`, () => {
      expect(titleError("a".repeat(TITLE_MAX + 1))).toBe(
        "Title can be at most 120 characters.",
      );
    });

    // 119 letters + 1 emoji = 120 for Postgres, 121 for .length.
    it("counts an emoji as one character at the limit", () => {
      expect(titleError(`${"a".repeat(TITLE_MAX - 1)}🌙`)).toBeNull();
    });

    it.each([
      ["empty", ""],
      ["only spaces", "   "],
      ["only invisible characters", "\u200b\u00a0"],
    ])("refuses a title that's %s", (_name, title) => {
      expect(titleError(title)).toBe("Title can't be empty.");
    });

    // FormData.get() gives null for a missing field, which someone sending
    // the POST by hand can do.
    it("refuses a missing title", () => {
      expect(titleError(null)).toBe("Title is required.");
    });

    it("refuses the NUL character, which Postgres can't store", () => {
      expect(titleError("Dark\0mode")).toBe(
        "Title contains a character that can't be saved.",
      );
    });
  });

  describe("description", () => {
    it(`accepts ${DESCRIPTION_MAX} characters`, () => {
      expect(descriptionError("a".repeat(DESCRIPTION_MAX))).toBeNull();
    });

    it(`refuses ${DESCRIPTION_MAX + 1} characters`, () => {
      expect(descriptionError("a".repeat(DESCRIPTION_MAX + 1))).toBe(
        "Description can be at most 5,000 characters.",
      );
    });

    // The \r\n trap, end to end. 2,501 letters on 2,500 lines, as a browser
    // sends them: 2,501 + 2 × 2,499 = 7,499 characters. Once each line break
    // is one "\n", it's 2,501 + 2,499 = exactly 5,000: accepted.
    it("counts a browser's \\r\\n line break as one character", () => {
      const lines = ["aa", ...Array.from({ length: 2499 }, () => "a")];
      const asSent = lines.join("\r\n");
      expect(asSent.length).toBe(7499);
      expect(descriptionError(asSent)).toBeNull();
    });

    it("refuses an empty description", () => {
      expect(descriptionError("\n\n")).toBe("Description can't be empty.");
    });
  });

  it("reports both fields at once, so the user fixes everything in one go", () => {
    const result = parseRequestInput({ title: "", description: "" });
    expect(result).toEqual({
      success: false,
      fieldErrors: {
        title: "Title can't be empty.",
        description: "Description can't be empty.",
      },
    });
  });
});
