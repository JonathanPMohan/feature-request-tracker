# Spec: end-to-end tests and launch (M9)

**Owner:** M9 changes no data model and no permission checks. (If one turns out to need changing, Jonathan writes it, as always.) Jonathan makes the decisions below, writes the README sections marked 🧑, and adds the production content. Claude writes the new tests, the screenshot script and the rest of the README, then reviews. M9's skill is **polishing a portfolio repo**: what a reviewer sees in their first two minutes, and making every claim in the README checkable.

PLAN.md: "Playwright tests for the main paths; README with screenshots and architecture."

## Where things stand

- **End-to-end tests:** 34 tests in 7 files, written milestone by milestone. Each one tests its own feature well: signing up, submitting, voting, commenting, admin, the demo account.
- **What none of them do:** follow one request through the whole product, the way the app is actually used. They also don't check accessibility or narrow screens.
- **On deployments,** only the read-only tests run: 9 against production after M8.
- **The README** is still create-next-app's.
- **Production** has one request on the board: "This is a test request". It's the first thing a reviewer would see.
- **The repo** has no license and no topics. Six issues are open: #2, #3, #4, #7, #9 and #11.

## Rules

| #   | Rule                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | **The main path, start to finish:** one test where a user submits a request, a second user votes and comments, an admin ships it, the second user's vote is frozen, and a visitor finds it under the "Shipped" filter. |
| L2  | **Accessibility** (decision B): the main pages have no serious or critical violations: the board, a request's page, sign in, sign up and new request.                                                                  |
| L3  | **Narrow screens** (decision B): the main path works at phone width, with nothing cut off and no sideways scrolling.                                                                                                   |
| L4  | **A reviewer can try the app within two minutes:** the live link and the demo account are on the README's first screen.                                                                                                |
| L5  | **Every claim in the README links to the proof:** "one vote per user, enforced by the database" links to the constraint and its test. A claim without a link is a claim an interviewer has to take on trust.           |
| L6  | **Screenshots can be taken again:** `npm run screenshots` retakes them, so they stay current after M10.                                                                                                                |
| L7  | **Production shows real content, not test data** (decision A).                                                                                                                                                         |
| L8  | **Known limitations are stated, not hidden:** each open issue is listed in the README with one line on why it's acceptable for now.                                                                                    |

## Part 1: end-to-end tests

### The main path (L1): `e2e/journey.spec.ts`

One long test on purpose. The feature tests prove each step works alone; this one proves the steps work together, which is how a reviewer will use the app. Using the existing tests' helpers, it:

1. User A signs up and submits a request. It opens with 1 vote.
2. User B signs up, votes (2) and comments.
3. A sees B's comment.
4. An admin (promoted with `npm run make-admin`, as in `admin.spec.ts`) sets the request to `shipped`.
5. B's vote button is disabled, and the count is still 2: frozen, not deleted.
6. A visitor finds the request under "Shipped", not under "Active".

It creates data and an admin, so it runs locally and in CI only, like the admin tests.

### Accessibility and phone width (L2, L3): decision B

- **Accessibility:** [axe](https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright) runs the automated part of the WCAG checks inside Playwright. It finds things like missing labels, low contrast and broken heading order, but not everything: a person still has to try the app with a keyboard. It's read-only, so it can also run against production.
- **Phone width:** a second Playwright project at a phone's screen size runs the main path again. The only test code needed is a check that the page doesn't scroll sideways.

Each new problem these find is fixed in M9 if it's small. Otherwise it gets an issue for M10.

## Part 2: launch

### Production content (L7): decision A

The board needs real requests before anyone is sent to it. Whatever goes there must be honest: **no fake users and no fake votes.** A board that pretends to have users is the kind of thing an interviewer may ask about.

### README

Written for two readers: a recruiter who reads the first screen, and an engineer who reads the rest.

| Section                | Contents                                                                                                                                                                      | Who                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Opening                | What it is, the live link, the demo account, one screenshot                                                                                                                   | 🧑 Jonathan         |
| Features               | What each kind of person can do: a visitor, a user, the demo account, an admin                                                                                                | Claude              |
| Architecture           | A diagram (Mermaid, which GitHub draws from text) and the five steps every action takes, linking to one real action                                                           | Claude              |
| Data model             | The tables, and the rules the database enforces itself: one vote per user, no demo admin, deleting cascades                                                                   | Claude              |
| Correctness under load | The three races found and fixed: double votes ("set, not flip"), double comments (submission keys), a vote during a status change (the row lock, #14). Each links to its test | Claude              |
| Testing                | The three layers, what each proves, and how deployed tests run against every Vercel deployment                                                                                | Claude              |
| How it was built       | Milestones, the specs in `docs/specs/`, and who wrote what (decision C)                                                                                                       | 🧑 Jonathan, Claude |
| What I learned         | Your own words                                                                                                                                                                | 🧑 Jonathan         |
| Run it locally         | Short, linking to `docs/LOCAL_DEVELOPMENT.md`                                                                                                                                 | Claude              |
| Known limitations      | The open issues (L8)                                                                                                                                                          | Claude              |

### Screenshots (L6)

`npm run screenshots` uses Playwright to save the board, a request's page and the demo sign-in to `docs/screenshots/`. It only reads, as a visitor, against production by default. It never signs in to production, so it can't change anything there.

The admin view is taken locally, where the test admin can be made. Images are committed, so the README shows them without anything running.

### Repo polish

- **GitHub topics** (`nextjs`, `typescript`, `postgresql`, `drizzle-orm`, `playwright`) help people find the repo. The description and homepage are already set.
- **A license:** decision D.
- **Pin it on your GitHub profile** after the merge. 🧑 Only you can do this.

## Open issues: decision E

| Issue | What                                                                  | Proposal                                                                                         |
| ----- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| #11   | The deployed smoke test accepts any `*.vercel.app` URL, not only ours | **Fix in M9:** a few lines in the workflow. An engineer reading `e2e-deployed.yml` could spot it |
| #2    | The broader version of #11: verify that the deployment belongs to us  | **Close with #11:** the hostname check covers the realistic risk                                 |
| #3    | Deployed test results don't show on the PR                            | Known limitation                                                                                 |
| #4    | A skipped deployed test can leave a deployment untested               | Known limitation                                                                                 |
| #7    | Neon's connection strings aren't Sensitive in Vercel                  | Known limitation. 🧑 Can only be fixed in the Vercel dashboard                                   |
| #9    | npm audit warnings in dev tooling                                     | Known limitation: dev tooling only, never shipped to the browser                                 |

## Who writes what

| File                                           | What                                                | Who                         |
| ---------------------------------------------- | --------------------------------------------------- | --------------------------- |
| `e2e/journey.spec.ts`                          | The main path (L1)                                  | Claude                      |
| `e2e/accessibility.spec.ts`, Playwright config | Axe checks and the phone-width project (decision B) | Claude                      |
| `scripts/screenshots.ts`, `docs/screenshots/`  | The screenshot script and images                    | Claude                      |
| `README.md`                                    | The sections in the README table above              | Claude, 🧑 the marked parts |
| `LICENSE`                                      | Decision D                                          | Claude                      |
| `.github/workflows/e2e-deployed.yml`           | Only this project's hostnames (#11)                 | Claude                      |
| Production content                             | Decision A                                          | 🧑 Jonathan                 |

## 🧑 Decisions

Write a sentence for each under "Jonathan's decisions" at the end.

### A. What goes on the production board?

| Option                                                                                                                                                  | For                                                                                                                                     | Against                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Requests about the tracker itself:** you submit 6 to 10 real ideas for this app (the v2 list in PLAN.md is a start), then set their statuses as admin | Honest: the board is used for what it's for. It shows every status. "I track this project's own roadmap on it" is a good interview line | Each request has one vote, yours, until someone else votes                                    |
| **A seed script** with made-up requests                                                                                                                 | Fast and repeatable                                                                                                                     | Made-up content on a real product. Its votes would come from accounts that aren't real people |
| **Leave it empty**                                                                                                                                      | Nothing to maintain                                                                                                                     | A reviewer sees an empty board and doesn't know what the app looks like in use                |

Either way, delete "This is a test request" with the admin controls from M8. To act as admin in production, run `npm run make-admin` against production yourself; it reads the database address from your environment. Claude never sees that address.

### B. Accessibility and phone width

| Option                        | For                                                                                                  | Against                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Both** (recommended)        | Cheap to add. Product-focused roles notice accessibility. Reviewers often open a link on their phone | A new dev dependency (`@axe-core/playwright`), and possibly some fixes found by the checks |
| **Accessibility only**        | The checks that find real problems                                                                   | Phone width stays untested                                                                 |
| **Neither, leave it for M10** | M9 stays smaller                                                                                     | The README can't claim either                                                              |

### C. How should the README describe working with Claude Code?

| Option                                                                                                                                                                       | For                                                                                                                                                        | Against                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Specific and up front:** who wrote what (you: the data model, the permission checks, the authorization steps, decisions; Claude: the rest, reviewed), linking to the specs | It's the truth, and it's visible anyway: every commit says `Co-Authored-By: Claude`. Owning the model, the permissions and the decisions is a strong story | Some reviewers discount AI-assisted work, whatever the split |
| **A short mention** at the end                                                                                                                                               | Keeps the focus on the product                                                                                                                             | Looks like playing it down when a reviewer opens the commits |

Not mentioning it isn't an option, because the commits show it. The question is only how prominently to say it.

### D. License

| Option                                                            | For                                                            | Against                                                                 |
| ----------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **MIT**                                                           | The usual choice for a portfolio: anyone may read and reuse it | Anyone may copy it, including into their own portfolio                  |
| **No license** (all rights reserved; GitHub still shows the code) | You keep every right                                           | Looks unfinished to some reviewers; legally, nobody may reuse any of it |

### E. Open issues

Agree with the proposals in "Open issues" above, or change any of them.

## Out of scope

Everything in M10: empty, loading and error states, and a more refined look. Also anything from PLAN.md's v2 list, analytics, and a custom domain.

## Jonathan's decisions

**A.** The board holds real ideas for this tracker, from the v2 list, with statuses set as admin. It's honest content, it shows every status, and the board tracks its own roadmap. No made-up users or votes.

**B.** Both. Reviewers often open links on a phone, and accessibility matters for the product-focused roles I'm targeting. Automated checks don't replace testing with a keyboard, so the README says so.

**C.** Specific and up front. I wrote the data model, permission checks, and authorization steps, and made every product and design decision. Claude Code wrote the rest under specs I approved, and I reviewed it. The commits show this, so the README says it plainly.

**D.** MIT, the usual choice for a portfolio project, so anyone can read and learn from it.

**E.** Agreed. #11 is fixed in M9, and #2 is closed with it. #3, #4, #7, and #9 are listed as known limitations, each with why it's acceptable for now.
