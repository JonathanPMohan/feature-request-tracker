# Spec: polish (M10)

**Owner:** M10 changes no data model and no permission checks. (If one turns out to need changing, Jonathan writes it, as always.) Jonathan makes the decisions below, which are mostly product and design calls, and reviews the result in a browser. When it ships, he marks the board's own "Empty and Loading States" request as shipped. Claude builds it and writes the tests.

PLAN.md: "Empty states, loading states, error states, a more refined look (aimed at product-focused roles)." M10 is optional; this spec keeps it to what a reviewer would notice.

## Where things stand

Surveyed on `main` after M9, with a probe that dropped the browser's requests the way M6's vote test does:

| Area        | Today                                                                                                                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Errors**  | **Submitting a request while offline replaces the whole page** with Next's built-in "This page couldn't load", and what was typed is lost. The comment form is built the same way. M6 fixed this for the vote button only. |
|             | **Signing in while offline** (email, or the demo button) stays on "Signing in…", with no message.                                                                                                                          |
|             | No `error.tsx`: an unexpected server error shows Next's default page, outside the app's look, with no way back.                                                                                                            |
| **404**     | Next's default "This page could not be found." No link back. A request an admin deleted (M8) looks the same as a mistyped address.                                                                                         |
| **Loading** | Plain "Loading…" text. When the content arrives, the page jumps.                                                                                                                                                           |
| **Empty**   | "No requests here yet." and "No comments yet.": true, but they don't say what to do next. An empty "Shipped" filter says the same as an empty board.                                                                       |
| **Look**    | Clean and plain. The favicon is still create-next-app's (Vercel's triangle). Every request's tab says "Feature Requests". A link pasted into LinkedIn or Slack shows no preview.                                           |

## Rules

| #   | Rule                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **A failed request never costs what was typed.** When the submit or comment form can't reach the server, the page stays, the text stays, and a message says what happened (like the vote button since M6). Sign-in and sign-up stop waiting and say so too.           |
| P2  | **An unexpected error shows a page in the app's style,** inside the normal layout (the header still works), with "Try again" and a link to the board. It never shows the error's details: in production Next.js hides them, and we never print them (decision C).     |
| P3  | **Not found says what happened and where to go:** an unknown address, and a request that doesn't exist or was deleted, each get a page in the app's style with a link to the board. Still marked `noindex`.                                                           |
| P4  | **Loading holds the shape of what's coming:** placeholders the size of the board's rows, the request page and the comments, so nothing jumps when the content arrives. Screen readers hear "Loading" once; the placeholders animate only if the system allows motion. |
| P5  | **Empty states say what to do next:** an empty board offers "Submit a request" (or sign in first); an empty filter names the filter ("Nothing shipped yet"); an empty conversation invites the first comment.                                                         |
| P6  | **The app looks like itself when shared:** its own icon, a tab title per request ("Dark Mode · Feature Requests"), and a link preview (decision E).                                                                                                                   |
| P7  | **A more refined look,** in the direction of decision A, with no component library (PLAN.md). Everything stays accessible: M9's axe checks keep passing, in light and dark mode.                                                                                      |

## How

- **P1:** the same pattern as the vote button. The form catches a request that fails outright, keeps its own copy of the text, and shows a message in an `alert`. For sign-in and sign-up, the button stops waiting and says the server couldn't be reached.
- **P2:** an `app/error.tsx` (inside the layout), plus an `app/global-error.tsx` for the rare case where the layout itself fails. In Next 16 these receive `retry()`, which fetches the page again; the older `reset()` only re-renders without fetching, and isn't what "Try again" should do (`node_modules/next/dist/docs`, error.md).
- **P3:** an `app/not-found.tsx` for unknown addresses, and one for `requests/[id]`. The status stays as it is: the request page streams before it knows the request is missing, so it answers 200 with `noindex` (see the comment in `src/app/requests/[id]/page.tsx`).
- **P4:** the existing `<Suspense>` fallbacks become placeholders shaped like their content. There's no route-wide `loading.tsx`: each section already has its own boundary, so the header and filters appear at once.
- **P7, the accent color (Jonathan's choice: neon "Slimer" green, `#7CFC00`).** On white it's 1.33 : 1, unreadable as text. As a fill under black text it's 15.8 : 1, and as text on the dark background 14.9 : 1. So it's used where it's readable:
  - **Both modes:** filled with black text (the main buttons, the voted vote button).
  - **Dark mode:** also links, accents and focus rings.
  - **Light mode:** text accents and focus rings use the deep green `#166534` (7.1 : 1 on white), and green fills get a dark border, so the voted state doesn't depend on a faint color difference.

  The fallback, if the green clashes in the browser, is blue `#2563EB` (5.2 : 1 on white).

- **P6:** Next's file conventions: `app/icon.svg`, `generateMetadata` on the request page, and `opengraph-image` for the preview.

## Tests

| File                        | Covers                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `e2e/requests.spec.ts`      | P1: submitting offline keeps the text and shows a message. P3: the new not-found page, for an unknown address and a missing request (it replaces the checks for Next's default text) |
| `e2e/comments.spec.ts`      | P1: commenting offline keeps the text and shows a message                                                                                                                            |
| `e2e/auth.spec.ts`          | P1: signing in offline shows a message and the button works again                                                                                                                    |
| `e2e/accessibility.spec.ts` | P3, P5, P7: the not-found page and an empty filter join the checked pages, in light and dark mode                                                                                    |
| `e2e/journey.spec.ts`       | P6: the request page's tab title                                                                                                                                                     |

**Not automated, and why:**

- **The error page (P2):** to test it, a page has to fail on purpose, and adding a page that throws to production would be a bug. Claude checks it in a throwaway copy that throws, as in M8, and attaches a screenshot to the PR.
- **The placeholders (P4):** a test can't slow the database down. They're checked by eye.

## 🧑 Decisions

Write a sentence for each under "Jonathan's decisions" at the end.

### A. Visual direction

| Option                                                                                                                                                                                                    | For                                                                                                                         | Against                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Refine what's there, plus one accent color** (recommended): the same calm zinc look, with tighter hierarchy, consistent spacing, one accent for the main actions and the voted state, and a simple icon | Restraint reads as product judgment. Small, safe changes, and every screen stays recognizable from the README's screenshots | Won't stand out on looks alone                                             |
| **A distinct brand:** a logo, a color palette, card-style rows, more personality                                                                                                                          | Memorable                                                                                                                   | Much more design work, and harder to keep accessible. Taste is a risk here |
| **Leave the look alone;** do the states only                                                                                                                                                              | M10 stays small                                                                                                             | "A more refined look" from PLAN.md is dropped                              |

### B. What does a row on the board show?

Today: votes, title, status and date.

| Option                                                 | For                                                                                                 | Against                                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **As today**                                           | Scannable, and no query changes                                                                     | You open a request to learn what it's about                                  |
| **Plus a one-line excerpt of the description**         | The board explains itself                                                                           | Longer rows: fewer requests fit on a screen                                  |
| **Plus the excerpt and a comment count** (recommended) | Shows where the conversation is, as most feedback boards do. M7 left the comment count out of scope | A count in the board's query: one more join, covered by the tests that exist |

### C. What does the error page tell people?

| Option                                                                        | For                                                                                                                                                                   | Against                                                                  |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **A friendly message, "Try again", and a small reference code** (recommended) | Next.js gives each server error a code (`digest`) that also appears in Vercel's logs, so someone who reports it gives you exactly what to look up. It reveals nothing | The code means nothing to most visitors; it's shown small, for reporting |
| **A friendly message and "Try again" only**                                   | Simplest                                                                                                                                                              | A report of "it broke" can't be matched to a log entry                   |

### D. The "Dark Mode" request on the board

The app already follows the system's dark mode; what's left is a toggle in the app.

| Option                               | For                                                                                             | Against                                                                                                                                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Leave it for later** (recommended) | M10 stays about states and look. Most people never change an app's theme against their system's | The request stays Planned                                                                                                                                                                                          |
| **Build the toggle in M10**          | Ships a second item from the board                                                              | The choice must be known before the page draws, or the page flashes the wrong theme. Reading a cookie for it would make every page wait for the request, giving up the instant static shell from `cacheComponents` |

### E. Link previews

| Option                                                 | For                                                                                         | Against                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **One preview image for the whole site** (recommended) | Made once at build time; costs nothing per visit. The link you'll share most is the board's | A shared request shows the site's image, not the request                                                |
| **One per request,** with its title, status and votes  | A shared request explains itself                                                            | Made on demand for each request, on the server; and its vote count is only as fresh as the cached image |

## Out of scope

Anything in PLAN.md's v2 list (editing, search, GitHub sign-in, email). Animations beyond the loading placeholders. A custom domain.

## Jonathan's decisions

**A.** Refine what's there and add one accent color. A restrained, consistent look shows product judgment better than a redesign.

**B.** Add a one-line excerpt and a comment count to each board row, so people can decide what to open and see where the discussion is.

**C.** Show a small reference code on the error page. It matches a log entry, so a report can be traced, and it reveals nothing sensitive.

**D.** Leave the dark mode toggle for later. It would need a cookie read before every page draws, giving up the instant static shell for a cosmetic feature. It stays Planned on the board.

**E.** One preview image for the whole site, generated at build time. Per-request previews aren't worth the complexity yet.
