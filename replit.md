# Ethio HUDHUD

An Arabic-first Amharic learning pilot for web, iOS and Android.

## Run & Operate

- Use the existing managed API, web and Expo workflows; they supply PORT and routing.
- `pnpm --filter @workspace/api-server run dev` — run the shared API service
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- `pnpm --filter @workspace/db run seed` — idempotent pilot curriculum seed
- `pnpm --filter @workspace/api-server test` — grading, review interval, timer and admin policy tests
- `pnpm run test:learning-path` — curriculum/path tests, desktop + Arabic mobile browser regressions, and isolated completion API persistence test (development/test DB required; see `docs/LEARNING_PATH_TESTS.md`)
- `pnpm --filter @workspace/api-server run bootstrap-owner` — idempotent verified owner setup using `ADMIN_BOOTSTRAP_EMAIL`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/ethio-hudhud` — React/Vite web client, Arabic/English UI
- `artifacts/hudhud-mobile` — Expo native client, Arabic UI
- `artifacts/api-server` — authenticated shared REST API and text tutor
- `lib/api-spec/openapi.yaml` — source of truth for generated clients and validators
- `lib/db` — PostgreSQL schemas, migrations and pilot seed
- `docs/BUILD_STATUS.md` — exact implemented scope, setup and release checklist

## Architecture decisions

- Preserve the scaffold's Drizzle ORM instead of introducing Prisma alongside it.
- App accounts use full name, username, and password; no email or Clerk sign-in.
- Native sessions use opaque bearer tokens in secure device storage; browsers use HttpOnly cookies.
- Local reminders are device schedules; web preferences do not imply notification delivery.

## Product

Working onboarding, 12 pilot lessons across six courses, Fidel practice,
server-graded exercises, vocabulary reviews, study plans, saved progress and a
text-only AI tutor. See BUILD_STATUS before describing this as a complete release.

## User preferences

Product integrity requirements are recorded in
`.agents/memory/product-integrity.md`; consult that file before extending scope
or claiming reviewer approval, voice capabilities or paid access.

## Gotchas

- Keep API keys and signing secrets server-only.
- The development schema used push; do not replay fresh SQL migrations without baselining.
- SQL migrations do not run at API startup; the startup seed is DML only.
- Course content is pilot material and needs qualified review; community and tutor booking are not implemented.
- Responsive web administration lives at `/admin`. App permissions are stored and checked
  server-side, separately from learner data. Only the owner assigns administrator roles.
- Owner bootstrap uses the server-side `ADMIN_BOOTSTRAP_USERNAME` and
  `ADMIN_BOOTSTRAP_PASSWORD` values; it grants ownership once per configured
  username and does not restore a revoked role on every restart.
- Apply new database schema through the appropriate host flow before production:
  EthioDeploy uses checked-in Drizzle migrations; Replit-managed production uses
  its Publish schema flow. The API does not auto-run schema DDL.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
