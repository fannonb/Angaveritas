-- Checkout attempts are separate from money received. Only verified transactions enter payments.
create table paystack_attempts (
  reference text primary key,
  invoice_id uuid not null references invoices(id),
  client_id uuid not null references users(id),
  client_email text not null,
  environment text not null check (environment in ('test','live')),
  amount_minor bigint not null check (amount_minor >= 300 and amount_minor <= 10000000000 and amount_minor % 100 = 0),
  currency text not null default 'KES' check (currency = 'KES'),
  purpose text not null check (purpose in ('deposit','balance')),
  status text not null default 'initializing' check (status in ('initializing','pending','success','failed','abandoned','review')),
  checkout_url text,
  transaction_id text unique,
  channel text,
  last_error text,
  reviewed_at timestamptz,
  reviewed_by uuid references users(id),
  review_note text,
  checks integer not null default 0,
  next_check_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index paystack_attempts_invoice on paystack_attempts(invoice_id,created_at desc);
create index paystack_attempts_retry on paystack_attempts(next_check_at) where status in ('initializing','pending');
alter table paystack_attempts enable row level security;

-- Signed events are durably acknowledged before provider verification/ledger work.
alter table gateway_events add column status text not null default 'pending' check (status in ('pending','processed','ignored','review'));
alter table gateway_events add column attempts integer not null default 0;
alter table gateway_events add column next_attempt_at timestamptz not null default now();
alter table gateway_events add column last_error text;
create index gateway_events_retry on gateway_events(next_attempt_at) where status = 'pending';

-- Receipt work survives a successful ledger commit followed by an email failure.
create table payment_receipts (
  payment_id uuid primary key references payments(id),
  sent_at timestamptz,
  locked_until timestamptz,
  last_error text
);
alter table payment_receipts enable row level security;
