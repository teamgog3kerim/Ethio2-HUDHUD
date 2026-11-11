# Ethio HUDHUD — working pilot and release checklist

## Implemented

- Arabic-first responsive web app, English web UI and dark/light themes.
- Mobile-browser home-screen installation: Android install dialog when supported,
  manual browser-menu fallback, iPhone/iPad Add to Home Screen instructions, app
  manifest/icons and standalone launch. Dismissal waits seven days before prompting
  again; standalone sessions do not show it. This installs the web app, not the
  separate Expo/native app. Learning still needs an internet connection. The
  network-only service worker never caches learner data or authentication.
- Expo native companion with Arabic learning screens and device dark/light themes.
- App-managed username/password sign-up and sign-in with user-isolated persistent
  learning records. Email and Clerk are not required for app access.
- Protected responsive web administration at `/admin`: a real user directory,
  search/pagination, names/goals, suspension/restore, owner-only admin assignment,
  confirmed full account deletion, expiring complimentary AI grants, settings,
  lesson editing/creation/archive and a recent audit trail.
- Guest mode on the web; native learning requires sign-in.
- Onboarding: goals, selected proficiency, daily target (default 60 minutes),
  timezone, reminder preference, and a conservative three-question web placement check.
- Six courses across beginner, intermediate and advanced stages with **70
  distinct pilot lessons**, practical conversations, and 101 number words from
  0 through 100, with multiple-choice exercises.
- Server-side answer keys, per-question explanations, 75% pass threshold,
  one-time completion XP, active-time caps and a duplicate-submission window.
- Fidel reference, optional transliteration, and scheduled vocabulary flashcards.
- A 180-day introductory lesson/review plan; goal choice prioritizes a later
  course, while preserving foundations. This is **not** 120 unique lessons.
- Optional web plan scheduling: saved local start date, preferred weekdays and
  profile timezone. The 180 activities are grouped onto selected study days within
  180 calendar days (some days contain several activities), not 180 study days.
  Current suggested week, upcoming practice/review and earlier incomplete lesson
  suggestions are separate from actual lesson completion. Pausing freezes the
  suggested week; resuming shifts suggestions by whole paused local calendar days.
  Changing the date/weekdays reanchors suggestions; removing the schedule restores
  the undated path. None of these actions edits completions or enables notifications.
- Actual progress, study minutes, seven-day activity, streaks and vocabulary counts.
- Text-only Amharic tutor using Replit AI Integrations for OpenAI, Arabic explanations,
  scenarios, recent context and privacy preference. Administrator-configured request
  limits (default 20 free / 100 complimentary) per rolling 24 hours, plus a per-IP
  minute limit. Clearing chat does not reset usage or account restrictions.
- JSON learning-data export, chat deletion and learning-data deletion.
- Native OS share sheet for actual achievements.
- Native local daily reminder, with OS permission, in the device's local timezone.
- Schema, generated API clients/validators, migrations, idempotent pilot seed, unit tests.

## Deliberately not represented as complete

- **Content review:** no seed content is described as reviewer-approved. A qualified
  Amharic reviewer must verify orthography, translations, explanations, transliteration
  and exercise answer keys. Do not publish these pilots as a certified curriculum.
- **Curriculum size and review:** the 70 current lessons are pilot material, not
  the requested 120 professionally reviewed lessons. The six-month structure,
  conversation lessons and 0–100 number lessons are present, but qualified
  Amharic review and complete coverage remain outstanding.
- **Audio:** no fake recordings, speech synthesis, voice conversation, listening
  exercises, or fabricated pronunciation scores. Recordings need licensing/review;
  pronunciation analysis needs a provider that actually supports Amharic.
- **Payments:** Polar is requested but not configured. The Premium screen is disabled.
  There is no working checkout, webhook handler, entitlement activation, cancellation
  portal or refund flow. No other billing provider has been substituted.
- **Qualified review:** the admin editor is not a linguistic-review certification.
  Content edits reset status to pilot. Independent qualified-review approval is pending.
- **Community/tutors:** friends, competitive challenges, referrals, public tutor
  discovery, availability and booking are not implemented. There are no invented
  tutors, bookings, testimonials or social statistics.
- **Notifications:** web reminder preference is saved only. No web push, server-side
  scheduled push, email campaign or quiet-hours engine. Native reminders are local
  device schedules, not a cloud delivery guarantee.
- **Offline:** bundled fonts/icon and cached queries are not an offline lesson
  download/synchronization system.
- **Account deletion:** learner self-service deletes learning records only.
  Authorized admins can permanently delete another user's sign-in identity and
  learning records after exact-email confirmation. The owner and destructive
  self-actions are protected. Administrative audit records are retained.
- **Guest-to-account migration:** browser guest work is not merged into a newly
  signed-in account. Sign in before studying if cross-device continuity matters.
- **Plan personalization:** introductory goal-based ordering is present; there is
  no adaptive proficiency engine or validated placement assessment.
- **App stores:** native distribution builds, store submissions, signed-in device
  verification and production release have not been completed.

## Architecture decisions

The existing pnpm workspace uses React/Vite, Express, PostgreSQL and **Drizzle**.
The source brief requested Prisma; this build preserves the scaffold's Drizzle
database rather than adding a competing ORM. OpenAPI is the contract; Orval
generates web/native hooks and Zod schemas from it.

The signed-in identity is stored in the app's PostgreSQL account tables. Web uses
an opaque HttpOnly session cookie; native uses an opaque bearer session stored in
the platform's secure storage. Passwords are stored as salted scrypt hashes.

Guest identities use signed HttpOnly cookies. Every learner-owned query/mutation
is scoped to the resolved learner. API answers never expose a lesson answer key
before submission. Completion XP is protected by a database uniqueness constraint.

AI transcript retention is optional. Disabling it deletes stored chat, but messages
are still sent to the model provider for processing. Content-free usage records are
separate so retention changes cannot reset the usage allowance.

Local rate limits and in-flight guards are per API process. Before multi-instance
production scaling, replace them with shared rate limiting / distributed locks.

## Setup

From the workspace root:

```sh
pnpm install
pnpm --filter @workspace/db run push
pnpm --filter @workspace/db run seed
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
pnpm --filter @workspace/api-server test
```

Use the existing managed artifact workflows for the API server, web app and Expo.
Their injected `PORT`/`BASE_PATH` values and preview routing must be preserved.
Do not start duplicate dev servers or hardcode localhost in application API calls.

For a new clean database, SQL migrations are in `lib/db/drizzle`; apply them with
`pnpm --filter @workspace/db run migrate`, then seed. The development database was
initialized using Drizzle schema push, so do **not** blindly replay migrations on
it: establish a baseline or use a fresh database first. Never run schema DDL from
API request handlers or automatically on server startup.

The seed runs idempotently on API startup after schema setup. It does not overwrite
existing content, and it never marks material as reviewed. Editing seed source
does not update already seeded records; use an explicit reviewed migration/update.

### Configuration (workspace secrets / environment settings)

See `.env.example` for variable names only; no keys are committed. OpenAI is
configured separately for each hosting provider. Database connection, session
secret, Polar credentials, and owner bootstrap password are server-only.

For a future production deployment, configure the real published API domain for
Expo's `EXPO_PUBLIC_DOMAIN` through the build environment. The current development
command uses the development domain, which must not become a production canonical
URL. Register native redirect URLs and store bundle identifiers before release.

### Manual verification / mobile release checklist

1. Create a fresh account with full name, username, and password, then finish onboarding.
2. Complete a lesson, restart the app and confirm progress survives.
3. Sign in to that account on the other client and confirm the same progress.
4. Use another account and confirm no previous learner records appear.
5. Verify wrong answers, retry, duplicate submission, one-time XP and quiz errors.
6. Verify SRS due times, midnight/streak boundaries and the selected timezone.
7. Test username/password sign-in and secure-session persistence on physical iOS
   and Android devices; email-based recovery is not provided.
8. Test font scaling, Fidel glyph rendering, Arabic reading order, keyboard movement,
   long lessons, dark mode and small screens.
9. Grant/deny local notification permission; change reminder time, sign out, travel
   between timezones, and inspect OS notification delivery. Re-enable after timezone
   changes. No remote notification infrastructure is configured.
10. Verify tutor provider failure, rate limits, clearing chat, and disabled retention.
11. Verify JSON export and destructive learning-data deletion confirmations.
12. Add reviewed curriculum, production abuse controls, complete identity deletion,
    consent/privacy policies and the missing release features before a public launch.
13. Configure real billing only after signed webhook verification and server-side
    entitlement tests. Never grant Premium from a client redirect or button click.
