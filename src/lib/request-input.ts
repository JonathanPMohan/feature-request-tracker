import { z } from "zod";

// Validation for a new feature request (spec S8). Runs on the server, inside
// the submit action: the browser's `required` and `maxLength` are only hints,
// since anyone can send the POST without the form.

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 5000;

/**
 * Cleans text the way we want it saved:
 * - Browsers send textarea line breaks as "\r\n". Saved as is, each one counts
 *   as 2 characters against the limit, so a description that fits in the box
 *   could be refused. Every line break becomes a single "\n".
 * - Surrounding whitespace is trimmed. JavaScript's trim() knows all Unicode
 *   spaces (non-breaking, ideographic, ...), not just " ".
 */
export function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

/**
 * Counts characters the way Postgres's char_length does: by code point.
 * JavaScript's `.length` counts UTF-16 units, so "😀".length is 2. Using it
 * would refuse a 120-character title with an emoji that the database accepts.
 */
export function characterCount(value: string): number {
  return [...value].length;
}

/**
 * True if the text has at least one character someone can see.
 *
 * Refused as "not visible":
 * - \s: every Unicode space.
 * - \p{Cf}: "format" characters (zero-width space, joiners, byte order mark,
 *   soft hyphen, direction marks).
 * - \p{Default_Ignorable_Code_Point}: characters Unicode says to draw as
 *   nothing, like the Hangul fillers (U+3164, U+115F, U+1160) and variation
 *   selectors. Found by /code-review.
 * - U+2800, the blank braille pattern: it's a real symbol, but empty.
 *
 * M4's database check only knows [:space:], so text made only of these got
 * through it (the known limit in docs/specs/m4-data-model.md). This is where
 * that's handled.
 */
const VISIBLE = /[^\s\p{Cf}\p{Default_Ignorable_Code_Point}\u2800]/u;

export function hasVisibleText(value: string): boolean {
  return VISIBLE.test(value);
}

function textField(label: string, max: number) {
  return (
    z
      // FormData.get() returns null for a missing field (or a File, for an
      // upload), so "is it a string?" is a real check here.
      .string({ error: `${label} is required.` })
      .transform(normalizeText)
      // Postgres text can't hold the NUL character: saving it is a database
      // error (22021), which would show as a crash instead of a message.
      .refine((s) => !s.includes("\0"), {
        error: `${label} contains a character that can't be saved.`,
      })
      .refine(hasVisibleText, { error: `${label} can't be empty.` })
      .refine((s) => characterCount(s) <= max, {
        error: `${label} can be at most ${max.toLocaleString("en-US")} characters.`,
      })
  );
}

export const requestInputSchema = z.object({
  title: textField("Title", TITLE_MAX),
  description: textField("Description", DESCRIPTION_MAX),
});

export type RequestInput = z.infer<typeof requestInputSchema>;
export type RequestFieldErrors = Partial<Record<keyof RequestInput, string>>;

/**
 * Validates a submitted form. On failure, returns one message per field (the
 * first problem found), ready to show next to the field.
 */
export function parseRequestInput(input: {
  title: unknown;
  description: unknown;
}):
  | { success: true; data: RequestInput }
  | { success: false; fieldErrors: RequestFieldErrors } {
  const result = requestInputSchema.safeParse(input);
  if (result.success) return { success: true, data: result.data };

  const { fieldErrors } = z.flattenError(result.error);
  return {
    success: false,
    fieldErrors: {
      title: fieldErrors.title?.[0],
      description: fieldErrors.description?.[0],
    },
  };
}
