-- Planning remains possible while collection is waiting on consent/payment/NDA.
-- Recording observations still requires the complete collection prerequisites.
create or replace function check_collection_guard() returns trigger language plpgsql as $$
declare eid uuid; collecting boolean; visit_status inspection_status;
begin
  if tg_op='DELETE' then perform assert_collection_open(old.inspection_id); return old; end if;
  if tg_op='UPDATE' and new.inspection_id<>old.inspection_id then raise exception 'Check inspection cannot be changed.'; end if;
  select status into visit_status from inspections where id=new.inspection_id for share;
  if visit_status is null or visit_status not in ('scheduled','in_progress') then raise exception 'Reopen the inspection before changing its checks.'; end if;
  if tg_op='INSERT' then collecting:=new.outcome<>'pending' or new.note<>'' or cardinality(new.evidence_ids)>0;
  else collecting:=(new.outcome,new.note,new.evidence_ids) is distinct from (old.outcome,old.note,old.evidence_ids); end if;
  if collecting then perform assert_collection_open(new.inspection_id); end if;
  if new.outcome<>'pending' and length(trim(new.note))<3 then raise exception 'Describe the result or why the check could not be completed.'; end if;
  if new.outcome='checked' and cardinality(new.evidence_ids)=0 then raise exception 'Link evidence for a completed check.'; end if;
  foreach eid in array new.evidence_ids loop
    if not exists(select 1 from files where id=eid and inspection_id=new.inspection_id and category='evidence' and status='ready')
      then raise exception 'Check evidence must belong to this visit.'; end if;
  end loop;
  new.updated_at:=now(); return new;
end $$;

-- Existing open visits gain required checks. Historical submitted/reviewed work
-- is preserved without inventing outcomes for past visits.
insert into inspection_checks(inspection_id,label,position)
select i.id,trim(regexp_replace(line,'^[-•*][[:space:]]*','')),position::integer
from inspections i cross join lateral regexp_split_to_table(coalesce(i.objectives,''),E'\n') with ordinality as lines(line,position)
where i.status in ('scheduled','in_progress') and trim(regexp_replace(line,'^[-•*][[:space:]]*',''))<>''
  and right(trim(line),1)<>':'
on conflict(inspection_id,label) do nothing;

create function payment_notice_scope_guard() returns trigger language plpgsql as $$
begin
  if not exists(select 1 from invoices i join projects p on p.id=i.project_id
    where i.id=new.invoice_id and i.project_id=new.project_id and p.client_id=new.submitted_by)
    then raise exception 'Payment notification must belong to the client and invoice project.'; end if;
  if tg_op='UPDATE' and (new.invoice_id,new.project_id,new.submitted_by,new.amount_kes,new.reference) is distinct from
    (old.invoice_id,old.project_id,old.submitted_by,old.amount_kes,old.reference)
    then raise exception 'Preserve the original payment notification.'; end if;
  return new;
end $$;
create trigger payment_notices_scope before insert or update on payment_notices for each row execute function payment_notice_scope_guard();

create function monitoring_cycle_consent_guard() returns trigger language plpgsql as $$
begin
  if not exists(select 1 from projects where id=new.project_id and monitoring_accepted_at is not null
    and monitoring_accepted_version=monitoring_plan_version and monitoring_status='active')
    then raise exception 'The client must accept the current monitoring fee and frequency first.'; end if;
  return new;
end $$;
create trigger monitoring_cycles_consent before insert on monitoring_cycles for each row execute function monitoring_cycle_consent_guard();
