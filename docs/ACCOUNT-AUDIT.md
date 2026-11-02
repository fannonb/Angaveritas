# Account lifecycle investigation — 27 October 2026

## Production routing finding

The local DNS resolver returned the old hosting address, `198.244.209.74`,
while all three authoritative Cloudoon nameservers, Google DNS and Cloudflare
DNS returned Vercel's `216.198.79.1`. Requests through the stale address served
the previous Vite website instead of the current Next.js application. This
can mix incompatible HTML, assets and registration responses in one browser
session and is consistent with the reported exception after submission.

The authoritative DNS records were already correct. Clearing this computer's
DNS cache made its resolver return `216.198.79.1`. Other networks can retain
the previous record until its cache expires; the authoritative A-record TTL
was 14,400 seconds (four hours). No mail records or nameservers were changed.

A production registration submission using an existing account email returned
the expected duplicate-account error when directed to Vercel. No production
test account was created and no real user's credentials were changed.

## Application fixes

- Preserve authentication, invitation and profile form entries after validation
  errors. Keep passwords in component memory only; do not store them in browser
  storage or echo them back from the server. Disable submit buttons while pending.
- Return inline errors for registration/sign-in infrastructure failures and JSON
  errors for authentication through the calculator API.
- Handle simultaneous registration/invitation attempts with conflict-safe inserts.
- Validate registration time zones against `Intl` before storing them.
- Serialize token issuance, prevent disabled accounts from using recovery links,
  and revoke outstanding links when disabling accounts or changing passwords.
- Consume password-reset/invitation tokens, save credentials, verify the address,
  and revoke sessions and other links in one transaction. Roll back everything
  if saving the password fails.
- Serialize session creation against account disabling and verify that the
  password hash has not changed since authentication.
- Refresh client detail pages after disabling or re-enabling an account.
- Provide reload/help screens for unexpected page or root-layout failures.

## Verification

Completed results:

- Optimized production build and TypeScript validation passed.
- 13 production-mode browser lifecycle checks passed with no client exceptions.
- 53 database integration tests passed, including seven new account regressions.
- 73 unit tests passed.
- Four non-destructive checks passed on the deployed custom domain; no missing
  application assets or browser exceptions were recorded.
- Vercel reported no production runtime errors in the post-deployment check.
- Production still contained its one original admin and zero client accounts
  after diagnostics. No real account passwords were changed or test emails sent.

Production deployment: `dpl_33frZ9KZDoN6e7is4EJWGtowf9oU`, serving
[angaveritas.com](https://angaveritas.com).

Local evidence: `test-results/av_accounts_1793094965361/checks.json` and
`test-results/account-smoke-1793095083326/checks.json`.

`npm run test:accounts` uses a disposable schema on localhost, synthetic accounts
and logged email only. For production-mode verification, first build with
`NEXT_DIST_DIR=.next-accounts`, then run with `ACCOUNT_TEST_PRODUCTION=1`.

Coverage includes registration validation and an injected database failure,
verification and replay protection, profile/preferences, password changes,
session revocation, logout, duplicate registration, forgotten passwords,
password reset, staff invitation/acceptance, role changes, account disable and
re-enable, calculator registration, and login throttling.

`npm run test:integration` includes account races, expired and wrong-purpose
tokens, transactional rollback, disabled-account recovery restrictions,
credential-change races and the existing application integrity/security checks.

`node scripts/check-production-accounts.mjs` performs non-destructive live
checks. Optionally set `ACCOUNT_SMOKE_EXISTING_EMAIL` to an existing account's
address to verify production database lookup without creating an account.

The application intentionally uses account disabling rather than hard deletion
to retain project and audit history. Email changes and data-deletion requests
remain support-managed as stated on the Account page. Inbox receipt of real
verification/reset emails requires a real recipient; local tests verify queued
email content and that the links complete the intended actions.
