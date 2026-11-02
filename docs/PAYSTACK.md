# Paystack payments

The app supports hosted Paystack checkout for existing KES invoices: remaining deposit or full remaining balance. The server calculates amounts; clients cannot submit arbitrary prices. Card and mobile-money availability depends on the merchant account. Existing manual payments and monitoring-cycle invoices continue to work. Automatic subscriptions and initiating refunds inside the app are outside this release.

## Configuration

For local sandbox setup, run `node scripts/configure-paystack-test.mjs`. This requires the local database and the payment migration. It creates a local-only audit account with no password, invitation or session, sets test mode and enabled channels in the ignored `.env.local`, and leaves a blank `PAYSTACK_SECRET_KEY` entry for your real `sk_test_...` key. It refuses remote databases and non-test keys. Restart the app after configuring the key. Checkout remains unavailable until a matching test key is present.

Use [Paystack's test payment details](https://paystack.com/docs/payments/test-payments/) for sandbox checkout. The documented M-Pesa test number is `+254710000000`. Webhook delivery still needs a publicly reachable HTTPS staging address or a tunnel to your local app; localhost alone cannot receive Paystack notifications. The return page can verify completed test transactions while the public webhook is being configured.

Apply `0022_paystack.sql` through `npm run db:migrate` against the intended deployment database before deploying the application. Do not point staging at the production database. The migration adds payment attempts, durable webhook processing state and a receipt queue; it does not change existing ledger entries.

Configure these server-only environment variables in local development/staging first:

| Variable | Value |
| --- | --- |
| `PAYSTACK_ENABLED` | `true` enables new checkouts; use `false` to pause them |
| `PAYSTACK_MODE` | `test` for staging; `live` for production |
| `PAYSTACK_SECRET_KEY` | Matching `sk_test_...` or `sk_live_...` secret from the Paystack dashboard |
| `PAYSTACK_ACTOR_ID` | UUID of a dedicated active admin used to attribute automated payment ledger/audit entries |
| `PAYSTACK_CHANNELS` | `card,mobile_money`, or only the enabled methods on the merchant account |
| `APP_URL` | Canonical HTTPS application origin |

Create the audit account through the existing staff account workflow or `npm run user:add -- payments@your-domain "Payment service" admin`, then find its UUID in the database. Use a company-controlled address. Do not use a client account. No login session is used by the payment processor. Keep the account active and restrict access to its authentication links. This identity is separate from `WORKER_USER_ID`, which authorizes monitoring invoice generation.

No Paystack public key or separate webhook signing secret is required. The Paystack secret key signs/verifies webhook HMACs. Never put it in a `NEXT_PUBLIC_` variable or commit it. Configure test and live keys in separate deployment environments.

In the Paystack dashboard configure:

- Webhook: `https://YOUR_DOMAIN/api/payments/paystack/webhook`
- Callback: `https://YOUR_DOMAIN/portal/payments/return` (also passed when initializing each transaction)

Paystack must be able to reach the webhook without a login screen or preview-deployment password. Keep the normal application sign-in requirements for client pages. Activate the business, settlement account and desired channels in Paystack before going live.

The `/staff/integrations` page displays configured mode, unresolved attempts and webhook events. “Configured” indicates environment configuration, not proof that Paystack has approved the merchant account or that the audit user exists. Checkout validates the audit account before initiating a payment.

## Worker and confirmation

The existing authenticated `/api/jobs` worker now retries pending verification, saved webhooks and receipt generation. Retain `CRON_SECRET` for Vercel GET requests or `WORKER_SECRET` for external POST requests. Schedule at least every five minutes where your hosting plan permits; the existing daily schedule is only a recovery fallback. Webhooks process immediately after durable acknowledgement, and the client's return screen also requests verification. Each worker invocation bounds provider requests and may need subsequent runs to drain a queue.

Confirmation verifies Paystack's reference, amount, KES currency, test/live domain and the email captured at checkout. Only verified successful transactions enter the append-only payment ledger. Invoice locks serialize gateway and manual entries. Deposits update project readiness through existing rules; all issued invoices must be paid (or waived) before clients can open published reports.

Checkout links are reused for 30 minutes. An ambiguous initialization timeout remains a saved attempt and is verified instead of automatically creating a second charge. After 30 minutes a new attempt can be created; any later successful overpayment is flagged for staff review. Repeated callbacks, webhook deliveries and verification requests do not duplicate ledger entries.

Disabling `PAYSTACK_ENABLED` stops new payments without stopping verification/refunds for existing attempts. Retain the credentials and worker while transactions remain unresolved. Switching modes or keys before draining pending events can prevent their verification; reconcile them in the old environment first.

## Refunds and exceptions

Initiate refunds in the Paystack dashboard. The app accepts signed refund notifications and independently fetches the refund record. It posts a refund to the ledger only when Paystack reports `processed`. Pending/processing notifications are retained without changing the ledger; failed, needs-attention and dispute notifications are shown for staff review. Refund notifications without a refund ID are reconciled by fetching the original transaction's refunds. Replayed events cannot duplicate refunds. Amounts with fractional KES are held for review because the existing app ledger uses whole KES.

The worker retries temporary provider/network failures. `/staff/integrations` allows admins to retry event verification. Cancelled invoices, amount/customer/currency mismatches, duplicate manual references, excessive refunds and successful charges exceeding the invoice balance require staff reconciliation. Verify the funds in Paystack before recording a manual correction or returning money. No retry button bypasses these checks. Unreviewed exceptions block further checkout on the invoice. After resolving the money movement, an admin can mark the attempt reviewed with a reconciliation note; this is audited and reopens checkout without changing the ledger or granting report access.

Confirmed payments/refunds queue the app's existing PDF receipt emails. Receipt generation is retried independently of the ledger commit. Delivery uses the existing email outbox. A process failure after email enqueue but before marking the receipt complete can produce a duplicate receipt; it cannot duplicate the money entry. Check email delivery configuration before launch.

## Validation and launch

1. Use an isolated test/staging database and test key. Verify only intended payment channels are offered.
2. Test deposit, full balance, failed/abandoned checkout and completing payment without returning to the app.
3. Replay signed notifications and retry verification; confirm there is only one ledger entry and one credit toward the invoice.
4. Check invoice ownership, pending confirmation, changed/cancelled invoice handling, fieldwork readiness and report access.
5. Issue a partial and full refund in Paystack, confirm ledger updates, and check reports relock when a balance reopens.
6. Confirm webhook reachability, worker frequency, staff review visibility and receipt email delivery.
7. Configure the approved live merchant key, live mode and live webhook in production. Perform small live card and M-Pesa transactions and a refund with the business owner before wider rollout.

Automated checks: `npm test`, `npm run typecheck`, `npm run test:integration`, `npm run build`. Paystack database regressions use an isolated `av_test_paystack_*` schema and require a local database. After building with `NEXT_DIST_DIR=.next-paystack`, `node scripts/test-paystack-browser.mjs` checks billing, invoice and project checkout controls, mobile rendering, confirmation screens and staff review visibility with intercepted payment requests. Provider requests in tests are mocked; these checks cannot establish that merchant credentials, real M-Pesa prompts, settlements or production webhooks work.

References: [Transactions](https://paystack.com/docs/api/transaction/), [Webhooks](https://paystack.com/docs/payments/webhooks/), [Verification](https://paystack.com/docs/payments/verify-payments/), [Refunds](https://paystack.com/docs/api/refund/).
