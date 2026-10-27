-- Billing follow-through: balance reminders that chase the invoice after its due date, and
-- manual payment-status overrides that the ledger reconciliation can no longer silently erase.
alter table invoices add column reminder_sent_at timestamptz;

-- When payment_status was last written on purpose (a recompute from the ledger, a manager
-- override, or a monitoring cycle). Reconciliation defers to an override that is newer than
-- the most recent ledger change; recording a payment or invoice resumes reconciliation.
alter table projects add column payment_status_set_at timestamptz;
