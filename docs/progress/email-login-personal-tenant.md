# Personal Auth0 tenant migration

Date: 2026-11-06

- Owner signed up / signed in through GitHub in their own Chrome session.
- Personal tenant: `dev-ss1vvx371ru1onqs.us.auth0.com`.
- Created `Repo Kaiju` as a confidential Regular Web Application.
- Enabled the `email` passwordless connection for this application.
- Configured modern Universal Login with `identifier_first: true`. Without identifier-first,
  the live login screen initially asked for a password despite the requested email connection.
- Registered localhost 5173/5174 and both existing public hostnames for callbacks and logout.
- Switched the local, ignored `.env` with the user's explicit approval. Removed the old Management
  API credentials and generated an independent cookie secret. A restricted backup is in `.cache`.
- No changes were made to the teammate's tenant. Production deployment was explicitly authorized and completed on 2026-11-06.
- No production SMTP provider is configured. Auth0's built-in sender is used for the live smoke check.
- Real email delivery, code verification and callback passed against an isolated localhost callback.
  `/api/me` returned the verified PSU email with `emailVerified: true`. OTP values are not retained here.
- GitHub social login / private repository access in the personal tenant have not been configured.
  The GitHub sign-in used for the Auth0 administrator account is separate from application login.

## Setup script corrections verified against the new tenant

- Connection enabled clients use the dedicated `/connections/{id}/clients` API. The legacy
  `enabled_clients` retrieval/update field no longer works on this tenant. Creation still accepts it.
- PATCH may return an empty response body; the setup script accepts that response.
- Setup requires and reads back both modern Universal Login and identifier-first configuration.

Secrets and OTP values are intentionally omitted from this record.

## Production deployment

- Origin: https://gitzilla.wilflin.me
- Base production revision: `85850cc87ad3ccb4379f6d253de48d1759342111`.
- Source snapshot: `9ff9cb88da897c411548787884e1292d39856e6b` (content fingerprint, not a Git commit).
- Prepared an isolated release over the active production source. Only email login, private classroom
  email storage, and email-bearing CSV/Markdown exports were added. Unshipped grading/review changes
  in the shared worktree were excluded. No project branch or index was committed or reset.
- Release passed typecheck, production build and 170 relevant tests before deployment.
- Fresh production PID: 117707. Service active; HTTPS home and public hall checks passed.
- Public email login redirects to the new tenant with the registered HTTPS callback, PKCE and a
  Secure/HttpOnly/SameSite=Lax transaction cookie. Existing public attestor identity was preserved.
- Runtime configuration backup: `/var/backups/gitzilla/runtime-before-email-20261106T201828Z.env`.
- Existing state was backed up by the deployment runner. Both code and environment had rollback handling.
- A full OTP callback on the public domain has not been exercised. The real-inbox OTP callback passed
  locally with the same auth code. Production SMTP provider and personal-tenant GitHub login remain unconfigured.
- Machine-readable local evidence: `.cache/email-deployment-report.json`.
