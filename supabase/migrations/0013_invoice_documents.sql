-- Invoice documents: itemised lines, cancellation with a reason, and when the invoice was last emailed.
alter table invoices add column line_items jsonb not null default '[]';
alter table invoices add column cancelled_at timestamptz;
alter table invoices add column cancelled_by uuid references users(id);
alter table invoices add column cancel_reason text;
alter table invoices add column sent_at timestamptz;

-- Invoices created on acceptance carry the accepted proposal's lines.
update invoices i set line_items = p.line_items from proposals p where p.id = i.proposal_id and i.line_items = '[]';
-- They were recorded as created by the client who accepted; the author of the proposal issued them.
update invoices i set created_by = p.created_by
  from proposals p, users u where p.id = i.proposal_id and u.id = i.created_by and u.role = 'client' and p.created_by is not null;

-- Issued amounts are fixed. Mistakes are corrected by cancelling (only while nothing is paid) and issuing again.
create function invoice_guard() returns trigger language plpgsql as $$
begin
  if (new.project_id, new.code, new.amount_kes, new.deposit_kes, new.proposal_id) is distinct from (old.project_id, old.code, old.amount_kes, old.deposit_kes, old.proposal_id)
    then raise exception 'Issued invoice amounts cannot be changed. Cancel it and issue a new one.'; end if;
  if old.status = 'cancelled' and new.status <> 'cancelled' then raise exception 'A cancelled invoice cannot be reissued.'; end if;
  if old.status = 'issued' and new.status = 'cancelled' then
    if exists (select 1 from payments where invoice_id = new.id) then raise exception 'This invoice has recorded payments. Record a refund instead of cancelling it.'; end if;
    if coalesce(length(trim(new.cancel_reason)), 0) < 5 or new.cancelled_by is null then raise exception 'Give a reason for cancelling the invoice.'; end if;
  end if;
  return new;
end $$;
create trigger invoices_guard before update on invoices for each row execute function invoice_guard();

-- Emails can carry files (for example an invoice PDF). Kept with the message so retries send the same document.
alter table email_outbox add column attachments jsonb;
