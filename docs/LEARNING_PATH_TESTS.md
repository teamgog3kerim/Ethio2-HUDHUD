# Six-month learning-path regression suite

Run the full check from the workspace root:

```sh
pnpm run test:learning-path
```

This command fails on any failing layer. It runs:

1. Existing API unit tests, including curriculum validation and the 75% quiz threshold for every seeded lesson.
2. Shared learning-path tests (six months / 24 weeks, all month boundaries, empty/uneven months, immutable cache inputs, resume and completion totals).
3. Playwright cases: six learning-path, three progress-identity, five completion-identity, four favourites and nine billing scenarios on desktop and again at 390 × 844 with reduced motion. Billing runs in both Arabic RTL and English LTR.
4. The real Express completion-route integration test. This is explicitly enabled by the command, not silently skipped.

## Prerequisites

- Install workspace dependencies with `pnpm install --frozen-lockfile`.
- A Chromium browser. Replit uses the Nix `chromium` package in `.replit`.
  Elsewhere run `pnpm --filter @workspace/ethio-hudhud exec playwright install chromium`
  (Linux CI may need Playwright's OS dependencies). You can override the executable
  with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`; otherwise system Chromium is preferred
  and Playwright's pinned browser is the fallback.
- `DATABASE_URL` must point to a migrated, seeded **development or disposable test**
  PostgreSQL database for the API layer. Do not point these commands at production.
  Database setup is separate: these tests never push a schema, seed, truncate,
  archive, or modify curriculum records.
- Port 4179 must be free. Playwright starts and stops its own test-only Vite server;
  it deliberately refuses to reuse an existing server. Normal app workflows and
  signed-in access are not needed for the browser tests.

## Scenarios

- Pass a quiz, see updated path progress, reload, pass again, return to Learn,
  reload again, and retain one completed lesson and the correct resume link.
- Fail, retry with cleared answers, fail again, reload Learn, and keep zero
  completions/XP.
- Receive a grading-request error, show no result or completion, retry the same
  answer payload, and award credit only after a successful server response.
- Follow Next and Back through all five month boundaries (including stage changes)
  and verify the first/last lesson edges; browsing never sends a completion.
- Navigate away with a partial answer/delayed callback, return to question one,
  finish, navigate to the next lesson, and return without stale results or answers.
- Hold passing and failing completion POST responses after a synthetic write,
  switch A to B or sign out without remounting the app/query client, then release.
  No old score, result, XP notification, invalidation call (including inactive
  keys), or completion-triggered refetch may enter the incoming session. Returning
  to A and reloading preserves only A's saved credit. A → B → A also rejects
  results from A's first session.
- Use all six month selectors and stage controls in Arabic; assert no horizontal
  page overflow on Learn, lesson reading, quiz and result views; inspect computed
  animation and transition durations with reduced motion enabled.

## Isolation and scope

The browser suite uses the **real Dashboard, Learn, Lesson, Account and Premium pages, Shell, React Query
hooks, Wouter links, language provider, timer, and production CSS**. Only auth
hooks are replaced by a test-only identity adapter. Each browser test gets a new
browser context and its own in-memory API records, based on the real curriculum
seed. The records survive that test's reloads but cannot reach any database or
account. Every `/api/` request is intercepted; unexpected endpoints and browser
runtime exceptions fail the test.

The delayed-write real-router case creates three random isolated learners (two
synthetic account identities and one guest), holds responses after the database
transaction, then reads as the incoming account or signed-out guest. It verifies
zero incoming credit and stable original completion IDs, timestamps and XP before
and after delivery. Only those learners and their cascading records are deleted.
These tests simulate the app's identity boundary, not a production account login.

Browser grading responses are a contract double, not evidence of backend grading.
The separate integration test mounts the **real learning router** with a trusted
test-only guest identity and a real database. It creates one random UUID learner,
reads existing active lessons without changing them, and deletes only that learner
in teardown (including its cascading starts, attempts, reviews and completions).
Teardown also runs on assertion failures. It checks invalid submissions, forged
client success fields, server-only answer keys, failed/deduplicated attempts,
passing/reloaded progress, review creation, and stable completion ID/timestamp/XP
after both immediate replay and a new passing attempt outside the duplicate window.
It also validates scheduling inputs, reloads saved date/day/timezone preferences,
checks that older whole-profile saves retain the schedule, and exercises pause,
resume, rescheduling and removal without changing completion timestamps or XP.
Pure scheduling tests cover local-midnight and DST boundaries, leap days,
weekday distribution, paused-week freezing and overdue-versus-progress separation.

The test server and guest adapters are not imported by the normal app entry.
These checks do not cover live account sign-in, published deployment routing, or a
single browser-to-database end-to-end session.

## Learning progress across identities

The three progress-identity scenarios exercise the same
`AuthQueryCacheInvalidator` mounted in `src/App.tsx`, not a test-only cache
reset. The test-only entry adds Dashboard so XP comes from the real progress hook
and resume links come from the real Dashboard and Learn pages.

- Keep one page and query client alive across guest → account A → account B →
  guest → B → A → guest. Each owner has different completed lessons, XP and next
  lesson. Assert the dashboard XP and resume link, Learn totals, every individual
  completion marker in the first month, and Learn's resume link. Reload both
  pages under each identity and verify the same owner-specific data returns.
- Switch identities while Learn stays mounted and the new courses response is
  held. The old completion list, total and resume link must disappear before
  the new response arrives, then show only the new owner's records.
- Hold outgoing accounts' progress and courses responses, switch to another
  account or guest, then release the old snapshots. Verify both pending views
  clear the old data and late responses cannot overwrite the current XP, resume
  link or completed lessons.

Run only these browser checks (no database, live API or credentials):

```sh
pnpm --filter @workspace/ethio-hudhud exec tsc -p tests/learning-path/tsconfig.json --noEmit
pnpm --filter @workspace/ethio-hudhud exec playwright test --config tests/learning-path/playwright.config.ts progress-identity.spec.ts
```

These are isolated provider/cache tests, not evidence of the production sign-in UI or
server token/ownership enforcement. Each test has three separate in-memory
records; all API calls fail closed outside the configured GET endpoints. The
synthetic identity persists in session storage across reloads and travels in a
test-only cookie before SDK listeners refetch. No real accounts, progress writes,
guest-to-account transfer or saved-item behavior are exercised.

## Favourites browser regressions

```sh
# Only saved-item browser checks; no database, credentials or live services
pnpm run test:favourites
```

The four favourites scenarios run on both browser projects and also run as part
of the full learning-path command:

- Save a lesson and conversation from their real detail pages, retain pressed
  states after reload, open Saved items, remove both there, and reload to confirm
  the empty state. Assert exact PUT/DELETE IDs and that no ownership or completion
  payload is sent.
- Keep one browser and mounted query client alive across guest → account A →
  actual sign-out confirmation → guest → account B → A → B transitions. Assert
  guest/account separation, retained account saves on return, account B's own
  distinct save, and no old links even while B's response is deliberately held.
  Also switch identities while a saved conversation detail control is mounted.
- Archive records in the fixture while Saved items remains open, advance the
  browser clock past the production 30-second refresh interval, and verify each
  link disappears without navigation, reload or a learner delete request.
- Activate lesson and conversation save controls with Enter and Space; verify
  accessible names, focus, pressed state, and removal with both keys in Saved.

These use the production account-change cache handler. Clearing cache entries
alone does not reset already-mounted query observers; the handler resets queries
and refetches active views so another identity cannot retain their visible data.
The test-only auth adapter emits listener events and persists its synthetic
identity across reloads. A test-only cookie carries that identity to the strict
in-memory route fixture; it is not an authentication cookie recognized by the app.
Separate save sets for guest and each account and an independent archived set
survive reloads within a test, never across tests. No real accounts or curriculum
records are created, modified or archived. Backend identity/archive enforcement
remains covered by the existing favourites integration tests; these browser
checks are evidence of client/UI behavior, not real account login or database
persistence. Completion and lesson-navigation behavior are outside their scope.

## Trial and pricing browser regressions

```sh
# Browser-only: no database, real accounts, API server or billing credentials
pnpm run test:billing
```

Nine scenarios run in Arabic RTL and English LTR on both desktop and
390 × 844 mobile (36 checks), also included in the learning-path browser command:

- Expired/day-three guest notices link to signup and plans and explicitly say
  guest progress does not transfer automatically. Switching the mounted client
  to a synthetic account removes signup/guest copy, including after reload.
- Proposed prices display $29 monthly / $174 over six months and $149 once,
  six-month duration and $25 / 14.4% savings from typed contract fixtures.
  Both checkout buttons stay disabled; no provider requests or writes are allowed.
- Expired trials still permit reading a lesson and opening both lesson and
  practical-conversation exercises. No enforcement is enabled.
- Advancing the browser clock through the production 60-second poll replaces
  the countdown with the expired prompt on the same mounted page.
- Returning to the window refreshes the status before the next poll, using the
  browser visibility event consumed by React Query (not a direct query refetch).
- Held responses show the pricing skeleton without false offers/notices.
  A failed response shows Retry; successful retry restores the cards.
  Pending/failed billing does not block conversation exercises.
- Complimentary expiry, monthly renewal and course expiry have distinct
  translated labels, localized dates, four-day examples and “in-app only”
  delivery copy. A complimentary grant is not presented as a trial.
- Pricing, prompts, loading/error states and expiry notices fit both viewports;
  every language case asserts the HTML language and direction.

The fixture is typed against the generated OpenAPI `BillingStatus` model from
`lib/api-spec/openapi.yaml`. Fixed server responses exercise rendering, not
server billing calculations. Existing `billing-policy.test.ts` and
`billing-status.db.test.ts` remain responsible for the 48-hour boundary,
timestamp persistence, clock carryover, concurrency, pricing calculations and
four-day reminder eligibility.

Each test owns fresh browser storage and two in-memory status records. A
context-wide interceptor rejects unexpected endpoints, all API writes, unknown
identities and external requests (including payment popups). Google Fonts CSS
is replaced by an empty local response to avoid external availability affecting
the test. Held responses and route handlers are released in teardown, including
when assertions fail; browser contexts and the test server are also disposed.
No real learner, owner, progress record or grant is created or modified.

The harness explicitly scans production `src` for Tailwind utilities because its
Vite root is in the test directory. This keeps responsive visibility and skeleton
height representative of the app instead of testing unstyled markup.
With responsive utilities applied, the existing mobile favourites sign-out check
uses the real Account page instead of the desktop-only sidebar button.
These checks do not test production signup, a real paid subscription, a payment
provider, or browser-to-database billing persistence. Polar stays deferred and
checkout/enforcement remain disabled.

## Focused commands and failure output

```sh
# Browsers only; no database or credentials needed
pnpm --filter @workspace/ethio-hudhud run test:learning-path

# One browser project
pnpm --filter @workspace/ethio-hudhud run test:learning-path --project=arabic-mobile-reduced-motion

# Real API persistence only (development/test DB required)
pnpm run test:learning-path:api
```

Browser fixtures and specs have a separate TypeScript check, run automatically
before Playwright. Failure traces are written under
`generated-artifacts/learning-path/`, ignored by Git and publication packaging.
Use `pnpm --filter @workspace/ethio-hudhud exec playwright show-trace <trace.zip>`
to inspect a failed run. Fix unexpected request fixtures deliberately; never
replace strict interception with passthrough to a live API.
