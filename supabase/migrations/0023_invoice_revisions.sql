-- Revise invoices without rewriting the agreed proposal or the payment ledger.
alter table invoices add column approved_amount_kes integer;
update invoices set approved_amount_kes = amount_kes;
alter table invoices alter column approved_amount_kes set not null;
alter table invoices add column revision integer not null default 1;
alter table invoices add column revision_reason text;
alter table invoices add column revised_at timestamptz;

create function invoice_approved_amount() returns trigger language plpgsql as $$
begin
  new.approved_amount_kes := new.amount_kes;
  return new;
end $$;
create trigger invoices_approved_amount before insert on invoices for each row execute function invoice_approved_amount();

create or replace function invoice_guard() returns trigger language plpgsql as $$
declare actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
begin
  if (new.project_id, new.code, new.proposal_id, new.approved_amount_kes) is distinct from
     (old.project_id, old.code, old.proposal_id, old.approved_amount_kes) then
    raise exception 'Invoice identity and approved amount cannot be changed.';
  end if;
  if (new.label, new.amount_kes, new.deposit_kes, new.line_items, new.due_on, new.revision, new.revision_reason, new.revised_at) is distinct from
     (old.label, old.amount_kes, old.deposit_kes, old.line_items, old.due_on, old.revision, old.revision_reason, old.revised_at) then
    if old.status <> 'issued' or new.status <> 'issued' then raise exception 'Only issued invoices can be edited.'; end if;
    if not exists(select 1 from users where id=actor and role in ('admin','analyst') and disabled_at is null)
      then raise exception 'Issued invoice amounts cannot be changed without an active billing manager.'; end if;
    if exists(select 1 from reports where project_id=new.project_id and status='published')
      and not exists(select 1 from users where id=actor and role='admin')
      then raise exception 'Only an admin can revise an invoice after report publication.'; end if;
    if new.revision <> old.revision + 1 or coalesce(length(trim(new.revision_reason)),0) < 5 or new.revised_at is null
      then raise exception 'A revision number and reason are required.'; end if;
    if new.amount_kes > old.approved_amount_kes then raise exception 'The total exceeds the approved amount.'; end if;
    if new.deposit_kes <> round(new.amount_kes * 0.6) then raise exception 'The required deposit is 60%% of the revised amount.'; end if;
    if jsonb_typeof(new.line_items) <> 'array' or jsonb_array_length(new.line_items)=0 or
       (select coalesce(sum((line->>'amount')::numeric),0) from jsonb_array_elements(new.line_items) line) <> new.amount_kes
      then raise exception 'Invoice lines must add up to the revised total.'; end if;
    if exists(select 1 from payment_notices where invoice_id=new.id and status='pending')
      then raise exception 'Confirm or resolve the pending payment reference before editing this invoice.'; end if;
    if exists(select 1 from paystack_attempts where invoice_id=new.id and
      (status in ('initializing','pending') or (status='review' and reviewed_at is null)))
      then raise exception 'Resolve the open checkout before editing this invoice.'; end if;
  end if;
  if old.status='cancelled' and new.status <> 'cancelled' then raise exception 'A cancelled invoice cannot be reissued.'; end if;
  if old.status='issued' and new.status='cancelled' then
    if exists(select 1 from payments where invoice_id=new.id) then raise exception 'This invoice has recorded payments. Record a refund instead of cancelling it.'; end if;
    if coalesce(length(trim(new.cancel_reason)),0)<5 or new.cancelled_by is null then raise exception 'Give a reason for cancelling the invoice.'; end if;
  end if;
  return new;
end $$;
