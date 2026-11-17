// Shared class names (M10, P7), so each kind of control looks the same
// everywhere, and a change of look is one edit. Tailwind finds class names
// in any source file, so they work from here.

/** The main action on a page: neon green, black text, a visible edge. */
export const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-md border border-accent-edge bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-60";

/** Everything else that's a button: quiet, outlined. */
export const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900";

/** A link inside text: the accent's readable shade, underlined. */
export const TEXT_LINK =
  "font-medium text-accent-text underline underline-offset-4 hover:decoration-2";
