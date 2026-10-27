-- Client payment notifications are claims to reconcile, never ledger entries.
create table payment_notices (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id),
  project_id uuid not null references projects(id),
  submitted_by uuid not null references users(id),
  amount_kes integer not null check(amount_kes>0 and amount_kes<=100000000),
  reference text not null check(length(trim(reference)) between 3 and 200),
  note text,
  status text not null default 'pending' check(status in ('pending','confirmed','declined')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references users(id),
  response text
);
create unique index payment_notice_reference on payment_notices(lower(trim(reference)));
create trigger payment_notices_audit after insert or update on payment_notices for each row execute function audit_record_change();
alter table payment_notices enable row level security;

alter table projects add column monitoring_plan_version integer not null default 0;
alter table projects add column monitoring_accepted_version integer;
alter table projects add column monitoring_accepted_at timestamptz;
alter table projects add column monitoring_accepted_by uuid references users(id);

-- Existing plans also require explicit confirmation before generating new cycles.
create function monitoring_acceptance_guard() returns trigger language plpgsql as $$
begin
  if (new.monitoring_interval_days,new.monitoring_fee_kes,new.monitoring_end_on) is distinct from
     (old.monitoring_interval_days,old.monitoring_fee_kes,old.monitoring_end_on) then
    new.monitoring_plan_version:=old.monitoring_plan_version+1;
    new.monitoring_accepted_version:=null;
    new.monitoring_accepted_at:=null;
    new.monitoring_accepted_by:=null;
  end if;
  return new;
end $$;
create trigger projects_monitoring_acceptance before update on projects for each row execute function monitoring_acceptance_guard();
