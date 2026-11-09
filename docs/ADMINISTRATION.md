# Administration

The web app is the primary distribution surface, including installation from
mobile browsers. Administrators use the same username/password sign-in as
learners and open the protected `/admin` panel.

## Initial owner

Set `ADMIN_BOOTSTRAP_USERNAME` and `ADMIN_BOOTSTRAP_PASSWORD` as encrypted
server-side variables before the first production startup. The default owner
username is `teamgog3`; choose and store a private password of at least 12
characters. Set `ADMIN_BOOTSTRAP_FULL_NAME` if a different display name is
needed. No email address, Clerk account, or email verification is required.

The bootstrap grants owner access once for that configured username. It does
not reset an existing password or restore a later-revoked role on every restart.
Change the password after first sign-in. There is no email-based password
recovery; keep the bootstrap credentials in the host's secret manager.

## Capabilities

- **Users:** search and paginate registered accounts by full name or username,
  edit profile details, suspend/restore accounts, and assign admin roles.
- **Account deletion:** requires exact username confirmation and a reason.
  Removes sign-in identity and learning records; minimal account tombstones and
  audit records remain. This action cannot be undone in the app.
- **Complimentary access:** explicit administrator grant with reason and expiry.
- **Settings:** learning and AI pause switches, usage limits, default study goal,
  announcements, and support contact.
- **Content:** validated lesson creation/editing, ordering, and archival.
- **Audit:** recent administrator actions and change reasons.
- **Visitors:** aggregate visits and approximate country information derived
  from the network address; this is not precise location or verified
  demographic data.

Administrator routes check the account role on the server. Learners cannot gain
access by changing browser state. Suspended accounts cannot sign in or use
protected app features.

## Development fixtures

`src/scripts/admin-fixtures.ts` creates disposable local username/password
accounts for UI checks. It refuses to run in production and stores a temporary
manifest under `/tmp`. After verification, run
`src/scripts/cleanup-admin-fixtures.ts`; it verifies the fixture usernames
before removing their identities and test records.
