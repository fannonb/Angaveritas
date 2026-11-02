# AngaVeritas: Hosting Handover

This document explains how to sign in to the services that run AngaVeritas (Vercel, Supabase, Cloudflare, and the
DNS and email services around them), and how to work on them alongside the current maintainer.

**This file contains no passwords, tokens or keys.** Those must never be written into a document, a chat or the
repository. They are shared through a password manager (see "How access is shared" below).

---

## 1. Before anyone else takes over: rotate exposed credentials

Several credentials were pasted into a chat during setup. Treat them as compromised. The current maintainer must
rotate them before handing over, and store the new values only in the password manager and in the Vercel
environment settings.

| Credential | Where it lives | How to rotate |
|---|---|---|
| Supabase database password | Supabase → Project Settings → Database | **Reset database password**, then update `DATABASE_URL` in Vercel |
| Cloudflare API token (`cfat_…`) | Cloudflare → My Profile → API Tokens | Revoke it, create a new one if still needed |
| R2 access key ID and secret | Cloudflare → R2 → Manage API Tokens | Create a new key pair, then update `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in Vercel, and revoke the old pair |
| Resend API key (`re_…`) | Resend → API Keys | Create a new key, update `RESEND_API_KEY` in Vercel, delete the old key |

After rotating, check the live site, sign-in and a test email before handing over.

---

## 2. How access is shared

Do not share one login between people. Give each person their own account on each service:

- **Vercel:** the owner invites the new person to the team (Team Settings → Members) with the Member or Owner role.
- **Supabase:** Organization → Team → Invite member.
- **Cloudflare:** Manage Account → Members → Invite.
- **GitHub:** repository settings → Collaborators.

Passwords and API keys for shared tools (for example the DNS panel) go into a shared password manager vault
(1Password or Bitwarden), never into email or chat. The person taking over sets their own password on first sign-in.

---

## 3. Services and how to sign in

### Vercel (hosting, deployments, environment variables)

- **Sign in:** https://vercel.com/login (choose the same sign-in method as the account owner, or use your own account
  once invited).
- **Team / scope:** `fannonbs-projects` (personal account of `fannonb`).
- **Project:** `angaveritas`
  - Project ID: `prj_iAYzIe2nJXrhm8avuxM1lQ508Ehu`
  - Framework: Next.js, Node.js 24.x, function region `dub1` (Dublin, set in `vercel.json`)
  - Production URL: https://angaveritas.com (alias: https://angaveritas.vercel.app)
- **Command-line access:**
  ```
  npm i -g vercel
  vercel login          # approve in the browser
  vercel link          # in the project folder; choose team fannonbs-projects and project angaveritas
  ```
- **Deploy to production:** from the project folder, `vercel --prod --yes`. This uploads the local folder, so commit and
  push first (see section 5) so everyone deploys the same code.
- **Environment variables:** Project → Settings → Environment Variables (Production). Names are listed in
  section 4. Values are hidden after saving; to change one, remove it and add it again.

### Supabase (database)

- **Sign in:** https://supabase.com/dashboard
- **Project:** `angaveritas`, reference `qzfsgcbucqjhmijgovza`, region `eu-west-1` (Ireland)
  - Dashboard: https://supabase.com/dashboard/project/qzfsgcbucqjhmijgovza
  - Plan: Free (see the notes in section 6)
- **Database connection:** production uses the **session pooler** on port **5432**, host
  `aws-0-eu-west-1.pooler.supabase.com`, user `postgres.qzfsgcbucqjhmijgovza`. The full string, with the password,
  is stored in the Vercel `DATABASE_URL` and the password manager. Do not copy it into files.
- **Schema:** 33 tables in `public`, managed by the SQL files in `supabase/migrations/` (17 applied). To apply new
  migrations, set `DATABASE_URL` for one terminal session and run `npm run db:migrate`. The script records each file
  in the `schema_migrations` table.
- **Admin account in the app:** one active admin (ID stored as `WORKER_USER_ID` in Vercel). Sign-in to the app uses
  the app's own user table, not Supabase Auth.
- **Connecting with an AI assistant:** `.mcp.json` in the project connects Claude Code to this project. Each person
  signs in to Supabase in their own session (`/mcp` → supabase).

### Cloudflare (file storage: R2)

- **Sign in:** https://dash.cloudflare.com
- **Account ID:** `8503f873c0c86ce43e91dc70be911052`
- **Bucket:** `angaveritas` (private; files are served only through signed, short-lived links)
- **CORS rules** on the bucket allow uploads from `https://angaveritas.com` and `http://localhost:3000`. If the
  site gets a new domain, add it here (R2 → angaveritas → Settings → CORS policy).
- **Access keys:** create a new R2 key pair under R2 → Manage API Tokens, give it Object Read & Write on the
  `angaveritas` bucket only, and store it in Vercel as `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.
- **Command-line access (optional):** `npx wrangler login` in the project folder. Wrangler needs an account API token
  with R2 permissions if you use an API token rather than browser login.

### Resend (outgoing email)

- **Sign in:** https://resend.com
- **Sending domain:** `angaveritas.com` (must show as verified; the DNS records are in section 3 under DNS)
- **API key:** create a key with "Sending access" only, store it in Vercel as `RESEND_API_KEY`.
- **Sender:** `AngaVeritas <no-reply@angaveritas.com>` (`EMAIL_FROM`); team inbox `info@angaveritas.com` (`NOTIFY_EMAIL`).

### DNS and mailboxes (domain `angaveritas.com`)

- **Nameservers:** Cloudoon (`ns1.cloudoon.com`, `ns2.cloudoon.net`, `ns3.cloudoon.org`). DNS is edited in the cPanel
  **Zone Editor** of the hosting account. Sign in to the cPanel hosting panel with the account owner's credentials, or
  ask the owner to add you as a user.
- **Website:** the apex domain must have two A records, `216.198.79.1` and `64.29.17.1` (Vercel). Remove any old A
  record pointing at the previous server.
- **Email:** MX records point at the mail host; keep them. Keep the Resend records (`send` and `rsend` CNAMEs,
  `resend._domainkey` TXT) and the SPF and DMARC records.
- **Mailboxes:** `info@angaveritas.com` must exist as a mailbox or forward. Check it in cPanel → Email Accounts.

### GitHub (source code)

- **Repository:** https://github.com/fannonb/Angaveritas (branch `main`)
- Clone it, then copy `.env.example` to `.env.local` for local work. Real values come from the password manager; the
  file is git-ignored and must never be committed.

---

## 4. Environment variables in Vercel (names only)

**Required in production:** `DATABASE_URL`, `APP_URL`, `STORAGE_DRIVER` (= `r2`), `R2_ACCOUNT_ID`, `R2_BUCKET`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `EMAIL_FROM`, `NOTIFY_EMAIL`, `RESEND_API_KEY`, `IP_HASH_SALT`,
`WORKER_SECRET`, `WORKER_USER_ID`, `CRON_SECRET`.

**Billing details shown on invoices and the Payments page (still to confirm):** `NEXT_PUBLIC_BILLING_NAME`,
`NEXT_PUBLIC_KRA_PIN`, `NEXT_PUBLIC_BILLING_ADDRESS`, `NEXT_PUBLIC_PAYBILL`, `NEXT_PUBLIC_BANK_DETAILS`.

**Optional:** `NEXT_PUBLIC_BOOKING_URL`, `NEXT_PUBLIC_WHATSAPP`, `NEXT_PUBLIC_USD_RATE`, `GEOCODER_URL`, `ROUTER_URL`,
`FILE_SCAN_URL`, `FILE_SCAN_KEY`.

Environment changes take effect only after the next deployment.

---

## 5. Working alongside the current maintainer

- **Source of truth:** the GitHub repository. Pull `main` before you start, and push small commits with clear messages.
- **Local-only changes:** `.vercelignore`, `vercel.json` and the email and database changes must be committed before
  anyone deploys from a different machine.
- **Deploying:** agree in the team chat before running `vercel --prod`, so two people don't deploy at once. Check
  https://angaveritas.com/login and the logs after each deploy (`vercel logs --deployment angaveritas.vercel.app`).
- **Logs:** Vercel's Hobby plan keeps runtime logs for about 30 minutes, so check them right after a problem occurs.
- **Database changes:** new migrations go in `supabase/migrations/` as the next numbered file. Never edit an applied
  migration; add a new one.

Suggested split while working in parallel:
- **Maintainer:** application code, email templates, deployments.
- **New person:** Supabase database checks and migrations, Cloudflare R2 and storage checks, DNS and mailboxes.

---

## 6. Known open items

- **Scheduler:** `vercel.json` runs `/api/jobs` once a day at 05:00 UTC (08:00 in Nairobi) through Vercel Cron, which
  needs `CRON_SECRET` set in Vercel. That retries failed email, sends balance reminders, generates monitoring invoices
  (with `WORKER_USER_ID`) and deletes abandoned uploads. Vercel's Hobby cron only runs once a day; for faster email
  retries, also have an external scheduler send `POST /api/jobs` with `Authorization: Bearer <WORKER_SECRET>` every
  few minutes.
- **Supabase plan:** free projects pause after about a week of inactivity and have no daily backups. Move to a paid
  plan before relying on the system for live client work, and keep a manual export until then.
- **Billing details:** `NEXT_PUBLIC_*` billing variables are not set yet; invoices omit those lines until they are.
- **Email delivery:** confirm that `angaveritas.com` shows as verified in Resend and that the `info@` mailbox receives
  mail. Test sends have been accepted by Resend; end-to-end delivery to `info@` was not yet confirmed.
- **Demo data:** the production database contains a single real admin account and no demo clients. Do not add demo
  data to production.
- **www subdomain:** `www.angaveritas.com` is not attached to the Vercel project.
- **Old server:** the cPanel server that hosted the old site is no longer used for the website, but still holds the
  mail hosting. Do not remove it.

---

## 7. First-day checklist for the new person

1. Accept the Vercel, Supabase, Cloudflare and GitHub invitations, and set your own passwords.
2. Get the shared vault invitation and check the entries for Supabase, Cloudflare, Resend and cPanel.
3. Clone the repository and run `npm install`.
4. Run `vercel login` and `vercel link`, then confirm `vercel env ls production` lists the names in section 4.
5. Open https://angaveritas.com, sign in as admin, and check the dashboard loads.
6. Confirm the Supabase dashboard shows the project and the 17 migrations.
7. Confirm the Cloudflare R2 bucket `angaveritas` exists.
8. Send one test email to yourself through the app and check it arrives.
