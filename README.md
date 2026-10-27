# AngaVeritas

The AngaVeritas website, client portal and staff workspace in one Next.js app, built around the
customer journey in `docs/Angaveritas Customer Journey.docx` and the platform described in the business plan (§10–11)
and the technical implementation document.

| Area | Who | What |
|---|---|---|
| Website (`/`, `/services`, `/pricing`, …) | Everyone | Marketing pages, sample report, contact form |
| Calculator (`/estimate`) | Everyone | 6-step itemised estimate. Submitting creates an account or signs in |
| Client portal (`/portal`) | Clients | Dashboard, requests, proposals (accept and sign online), projects, onboarding, inspections and findings, evidence, reports, documents, messages, updates |
| Staff workspace (`/staff`) | Field agents, analysts, admins | Pipeline, request qualification, proposal builder, project management, inspections, evidence QA, report review and publishing, clients, enquiries, team, pricing, audit log |

## How the journey maps to the app

| Stage | In the app |
|---|---|
| 1 Awareness | Website pages |
| 2 Inquiry | Calculator → request (`AVR-…`) with the client's brief: what to verify, concerns, investment size, timeline. Contact form → website enquiry |
| 3 Consultation & scope | Analyst qualifies (priority, owner), builds a proposal pre-filled from the estimate, sends it. Client accepts with a typed-name signature (or declines). NDA can be requested |
| 4 Onboarding | Acceptance opens a project (`AVP-…`). Client adds site directions, access notes, claims to verify, contacts and documents, and gives data-processing consent |
| 5 Planning | Staff assign lead analyst and field agent, record payment, write internal planning notes, schedule inspections (`AVI-…`). The client's claims become the field checklist |
| 6 Fieldwork | Field agent opens the inspection on a phone: records findings (status, confidence, evidence grade E1–E5) and uploads photos/video. Each file is hashed (SHA-256); GPS and capture time are read from photo metadata; missing GPS, odd timestamps or photos taken over 3 km from the site are flagged |
| 7 Analysis | Someone other than the field agent reviews the inspection, which releases findings and unflagged evidence to the client. An analyst writes the report; a second person approves it |
| 8 Delivery | Client is notified; reads the report on screen (prints to PDF) or downloads an attached PDF; sees the evidence archive |
| 9 Follow-up | Client rates the report, messages the analyst, requests a follow-up inspection (added to the same project) |
| 10 Retention | Retainer projects, portfolio dashboard with a map of Kenya, health per project |

Every step is written to the audit trail (`events`); steps that matter to the client also appear in their project history,
in-app updates and email.

## Integrity and operations

- Reports reference reviewed inspections from their own project. Publication captures a permanent snapshot of the report, project, findings and evidence hashes. Attached and referenced files are preserved. Withdrawing a report revokes future PDF access and records the reason.
- An independent analyst/admin must approve inspections and reports. Verified findings require linked inspection evidence. Risk findings include category, likelihood, impact and mitigation. Video and other media require manual QA; releasing held evidence requires a review note.
- Field agents only download assigned inspection evidence and client documents explicitly approved for field access. Internal files, report PDFs and agreements are restricted.
- Fieldwork requires completed onboarding, consent, the required payment (or documented waiver), and staff assignments. Stages advance through the workflow rather than arbitrary status editing.
- The **Billing & service** project tab contains invoices, deposit/balance records, payment/refund receipts, NDA acceptance, cancellation/privacy requests, monitoring plans/cycles and actionable alerts. Accepted proposals create invoices using their stated deposit. Payment records are append-only and references are unique.
- Monitoring creates one invoice per due cycle; visits are dispatched after payment. The next date advances without retrospectively issuing every missed cycle. The team records agreed scope and plan fees.
- Database triggers record before/after changes; new audit entries form an append-only SHA-256 chain. Valid legacy reports are frozen at the migration baseline. This does not reconstruct missing historical evidence or protect against a privileged database administrator replacing the database; external audit checkpoints are a deployment consideration.
- Upload completion checks file size and signatures. An optional configured scanner receives the raw bytes and must return an explicit clean result.
- The field page offers opt-in device note drafts and revision-checked sync. This is recovery for interrupted connectivity, not a complete offline PWA or offline media capture.

See `docs/IMPLEMENTATION_STATUS.md` for completed work, integration boundaries and remaining roadmap items.

## Integration configuration

`/staff/integrations` shows configuration and email delivery status. Without an email key, messages remain in the outbox and development links are printed to the terminal. With a Resend key, delivery is attempted immediately and failed sends are retained for retry.

Schedule `POST /api/jobs` with `Authorization: Bearer <WORKER_SECRET>` for email retries. Set `WORKER_USER_ID` to a dedicated active admin if the worker should also generate monitoring invoices. Do not put worker secrets in browser code or URLs. Jobs do not dispatch field teams or process real payments.

`NEXT_PUBLIC_BOOKING_URL` and `NEXT_PUBLIC_WHATSAPP` enable the existing contact paths. `FILE_SCAN_URL` accepts an authenticated raw-byte POST and must respond with `{ "clean": true }`; `FILE_SCAN_KEY` supplies its Bearer credential.

Payment checkout/callback routes and the gateway contract are scaffolded in `src/lib/integrations.ts`. They **fail closed** until a real provider adapter and reconciliation handler are implemented and tested. Adding keys alone does not turn these into live M-Pesa/card payments. The manual billing ledger is usable now.

Pricing retains the technical blueprint's round-trip thresholds and subtotal urgency rule. Admins can set an approved per-extra-site fee. Until configured, missing fees/travel are marked TBC. Located additional sites are costed as separate return trips; shared routes and work duration are confirmed in the proposal.

## Regression checks

```bash
npm test                  # pricing, permissions, workflow and upload policy tests
npm run typecheck
npm run test:integration  # creates/removes an isolated av_test_* schema in DATABASE_URL
npm run build
```

Integration tests exercise the migrations and real queries for tenant isolation, report snapshots/withdrawal, independent QA, deposits/refunds, recurring cycles, consent withdrawal and email retries. They do not send real emails or payments.

## Roles

- **Client**: registers on the website. Sees only their own requests and projects, and only reviewed evidence and published reports.
- **Field agent**: only the inspections and projects assigned to them. No client finances, contact details or messages.
- **Analyst**: the whole pipeline. Can view pricing.
- **Admin**: everything, plus team invitations, pricing changes and the audit log.

Staff accounts are invitation-only (`/staff/team`).

## Run locally

Requirements: Node 20.19+ (or a newer supported release), PostgreSQL 13+.

```bash
npm install
cp .env.example .env.local      # set DATABASE_URL and SESSION_SECRET
npm run db:migrate
npm run user:add -- you@angaveritas.com "Your Name" admin   # prints a link to set your password
npm run dev                      # http://localhost:3000
npm test                         # pricing engine tests
```

Without `RESEND_API_KEY`, emails (verification, password reset, invitations, notifications) are printed to the
terminal running `npm run dev`, so you can click the links there.

On this computer the database is the standalone PostgreSQL cluster in `D:\tmp\av-pgdata` on port 5499. Start it after a reboot:

```
"C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D "D:\tmp\av-pgdata" -l "D:\tmp\av-pg.log" -o "-p 5499" start
```

## Deploy (Vercel + Supabase)

The site needs Node hosting now; plain cPanel/PHP hosting no longer works.

1. **Supabase**: create a project. Run `npm run db:migrate` with `DATABASE_URL` set to the **Transaction pooler** string (port 6543).
   Files live in Cloudflare R2 (see step 2), so no Supabase storage bucket is needed.
2. **Vercel**: import the repository and set:
   - `DATABASE_URL`, `SESSION_SECRET` (long random string), `IP_HASH_SALT` (long random string), `APP_URL=https://angaveritas.com`
   - Files: `STORAGE_DRIVER=r2`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (the private bucket, e.g. `angaveritas`). Create the access key under R2 → Manage API Tokens; the secret is shown once.
   - Email: `RESEND_API_KEY`, `EMAIL_FROM` (a verified sender such as `AngaVeritas <no-reply@angaveritas.com>`), `NOTIFY_EMAIL` (team inbox)
3. Point `angaveritas.com` at Vercel. Run `npm run user:add` once against production for the first admin.

## Where things live

```
src/app/(site)/      website pages and the calculator
src/app/(auth)/      sign in, register, password reset, email verification, staff invitations
src/app/portal/      client portal
src/app/staff/       staff workspace (actions.ts holds every staff action)
src/app/api/         calculator submission, place search, distance, file upload/download
src/lib/auth/        passwords (scrypt), database sessions, emailed tokens
src/lib/data/        database queries, one file per area; projects.ts holds the access rules
src/lib/pricing/     pricing engine (unit-tested) and editable configuration
src/lib/site.ts      business details: phone, WhatsApp, booking link, USD rate
supabase/migrations/ database schema
docs/                business plan, customer journey, technical and pricing documents (not deployed)
```

## Not built yet

From the technical document's later phases: live payment-provider adapters (M-Pesa/card), a complete offline field app, automated PDF generation
(reports print to PDF from the browser, or staff upload a designed PDF), market-intelligence feeds, calendar booking
(set `bookingUrl` in `src/lib/site.ts` to show booking links), WhatsApp/SMS notifications.
