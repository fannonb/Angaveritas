alter table projects add column nda_status text not null default 'none' check (nda_status in ('none','requested','prepared','signed'));
alter table projects add column nda_file_id uuid references files(id);
alter table projects add column nda_signed_name text;
alter table projects add column nda_signed_at timestamptz;
alter table projects add column monitoring_status text not null default 'inactive' check (monitoring_status in ('inactive','active','paused','cancelled'));
alter table projects add column monitoring_interval_days integer check (monitoring_interval_days between 7 and 366);
alter table projects add column monitoring_fee_kes integer check (monitoring_fee_kes > 0);
alter table projects add column next_cycle_on date;
alter table projects add column monitoring_end_on date;
alter table users add column email_updates boolean not null default true;
alter table files drop constraint files_category_check;
alter table files add constraint files_category_check check (category in ('evidence','client_document','report','internal','agreement'));

create sequence invoice_number_seq start 1001;
create table invoices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  proposal_id uuid references proposals(id),
  code text not null unique default ('AVB-' || nextval('invoice_number_seq')),
  label text not null,
  amount_kes integer not null check (amount_kes > 0),
  deposit_kes integer not null check (deposit_kes >= 0 and deposit_kes <= amount_kes),
  due_on date,
  status text not null default 'issued' check (status in ('issued','cancelled')),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique(proposal_id)
);
create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id),
  amount_kes integer not null check (amount_kes > 0),
  kind text not null check (kind in ('payment','refund')),
  provider text not null default 'manual',
  reference text not null,
  note text not null,
  recorded_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  unique(provider,reference)
);
create table monitoring_cycles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  cycle_on date not null,
  invoice_id uuid not null references invoices(id),
  inspection_id uuid references inspections(id),
  created_at timestamptz not null default now(),
  unique(project_id,cycle_on)
);
create table service_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  kind text not null check (kind in ('cancellation','monitoring_pause','monitoring_cancel','data_access','consent_withdrawal')),
  reason text not null,
  status text not null default 'requested' check (status in ('requested','completed','declined')),
  resolution text,
  requested_by uuid not null references users(id),
  resolved_by uuid references users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create table project_alerts (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references projects(id),
  title text not null, detail text not null, owner_id uuid references users(id),
  severity text not null check (severity in ('at_risk','high_risk')),
  acknowledged_at timestamptz, resolved_at timestamptz, resolution text,
  created_at timestamptz not null default now()
);
create table email_outbox (
  id uuid primary key default gen_random_uuid(),
  recipients text[] not null, subject text not null, body text not null, reply_to text,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
  locked_at timestamptz, sent_at timestamptz, last_error text, created_at timestamptz not null default now()
);
create index email_outbox_queue_idx on email_outbox(status,next_attempt_at);
create table gateway_events (
  provider text not null, event_id text not null, payload jsonb not null, received_at timestamptz not null default now(),
  primary key(provider,event_id)
);
do $$ declare t text; begin
  foreach t in array array['invoices','payments','monitoring_cycles','service_requests','project_alerts','email_outbox','gateway_events'] loop
    execute format('alter table %I enable row level security',t);
  end loop;
  foreach t in array array['invoices','payments','service_requests','project_alerts'] loop
    execute format('create trigger %I after insert or update or delete on %I for each row execute function audit_record_change()',t || '_audit',t);
  end loop;
end $$;
create trigger payments_immutable before update or delete on payments for each row execute function immutable_event();
