# EthioDeploy deployment guide

Ethio HUDHUD runs on EthioDeploy as one Node service: Express serves the API,
Polar webhooks, background workers, and the Vite-built web app. Sign-in uses
the app's own username/password accounts; no Clerk or email sign-in is used.

## 1. Connect GitHub

Connect the private `teamgog3kerim/Ethio2-HUDHUD` repository to EthioDeploy and
select the `main` branch. Enable deployment on pushes to `main` if the project
offers automatic deploys. A GitHub push updates the source; it does not configure
EthioDeploy secrets, database migrations, DNS, or payment-provider settings.

## 2. Configure the service

- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm run build`
- Start: `pnpm start` (runs the checked-in database migrations before starting)
- Health check: `/api/healthz`
- Runtime: Node.js service listening on EthioDeploy's `PORT`
- Keep an always-on instance; it runs scheduled reminder and billing workers.

The root `build` and `start` scripts select the web/API production service; promo
artifacts are not part of this deployment. `nixpacks.toml` mirrors those commands.
No Clerk or Vite authentication keys are needed.

## 3. Add encrypted environment variables

Set these in EthioDeploy's encrypted environment/secrets settings. Never put
secret values in GitHub, source files, or chat.

Required:

- `DATABASE_URL` — this EthioDeploy service's PostgreSQL connection string.
- `SESSION_SECRET` — random secret of at least 32 bytes.
- `ADMIN_BOOTSTRAP_USERNAME=teamgog3`
- `ADMIN_BOOTSTRAP_PASSWORD` — initial owner password, at least 12 characters.
- `OPENAI_API_KEY` — provider-owned key for the AI tutor.
- `POLAR_LIVE_ACCESS_TOKEN` and `POLAR_LIVE_WEBHOOK_SECRET`.
- `PUBLIC_APP_ORIGIN=https://ethiohudhud.com`
- `ALLOWED_ORIGINS=https://ethiohudhud.com` (include `https://www.ethiohudhud.com`
  only if that hostname will serve the app).
- `RENEWAL_VAPID_PUBLIC_KEY`, `RENEWAL_VAPID_PRIVATE_KEY`, and
  `RENEWAL_VAPID_SUBJECT`. Generate a matching pair with
  `pnpm --filter @workspace/api-server exec web-push generate-vapid-keys`.

Optional: `ADMIN_BOOTSTRAP_FULL_NAME`, `OPENAI_BASE_URL`, and
`EXPO_PUSH_ACCESS_TOKEN`. EthioDeploy supplies `PORT`. Do not set `SERVE_WEB`
manually; the start script enables it.

The bootstrap creates the `teamgog3` owner account on first startup. Keep the
initial password private and change it after signing in. The app does not send
password-reset emails. Billing checkout can collect payment contact details on
Polar's hosted checkout; those are separate from app account credentials.

## 4. Prepare the database

Create the PostgreSQL database first. The start command applies the checked-in
Drizzle migrations before the API seeds the curriculum and starts its workers.
Do not point a new empty database at the public domain until migration,
curriculum seeding, and verification have succeeded. Existing Replit accounts
use a different identity system and are not automatically converted to
username/password accounts. Their old learner, billing, and progress records
are not deleted, but they will not appear under new accounts without a separate,
backed-up, explicitly approved identity/data migration.

## 5. Verify the preview before domain cutover

1. Check `/`, `/learn`, `/account`, `/admin` and direct-route reloads.
2. Check `/api/healthz`, database migrations, and startup logs.
3. Register with full name, username, and password; sign out and sign in again.
   Verify that no email or Clerk prompt is required.
4. Verify the owner can open `/admin`, and a learner cannot.
5. Verify the 48-hour trial, $29 manually renewed monthly option, and $149
   six-month option using the approved test plan. A successful checkout redirect
   alone does not prove paid access; wait for verified Polar reconciliation.
6. Test the Polar webhook at
   `https://ethiohudhud.com/api/billing/polar/live/webhook`.
7. Verify AI tutoring, reminders, PWA installation, and mobile-sized pages.

Do not test live payments with a real card. Keep the existing Replit deployment
and its database intact until the new service and any separately approved data
migration are verified. Obtain DNS targets from EthioDeploy's own project screen;
do not infer them from this repository.
