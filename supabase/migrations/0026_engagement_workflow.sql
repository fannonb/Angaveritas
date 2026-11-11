-- Give repeat work its own commercial, operational and delivery boundary.
create table work_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  proposal_id uuid references proposals(id),
  title text not null,
  scope text not null default '',
  due_on date,
  brief_version integer not null default 1,
  brief_approved_version integer,
  brief_approved_by uuid references users(id),
  brief_approved_at timestamptz,
  brief_snapshot jsonb,
  required_sites integer not null default 1 check(required_sites between 1 and 100),
  hold_reason text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(proposal_id)
);
alter table projects add column active_work_order_id uuid references work_orders(id);
alter table invoices add column work_order_id uuid references work_orders(id);
alter table inspections add column work_order_id uuid references work_orders(id);
alter table reports add column work_order_id uuid references work_orders(id);
alter table invoices add column balance_on_delivery boolean not null default false;
alter table inspections add column client_confirmed_at timestamptz;
alter table inspections add column schedule_version integer not null default 1;
alter table reports add column review_exception text;
alter table inspections add column review_exception text;

insert into work_orders(project_id,proposal_id,title,scope,due_on,brief_approved_version,brief_approved_at,brief_snapshot,created_at)
select p.id,p.proposal_id,p.title,coalesce(array_to_string(pr.scope_items,E'\n'),p.claims,''),p.due_date,
  case when p.onboarding_submitted_at is not null then 1 end,p.onboarding_submitted_at,p.service_brief,p.created_at
from projects p left join proposals pr on pr.id=p.proposal_id;
update projects p set active_work_order_id=w.id from work_orders w where w.project_id=p.id;
update invoices i set work_order_id=p.active_work_order_id from projects p where p.id=i.project_id;
update inspections i set work_order_id=p.active_work_order_id from projects p where p.id=i.project_id;
-- Only this additive association changes; historical report content/snapshots remain untouched.
alter table reports disable trigger reports_integrity;
update reports r set work_order_id=p.active_work_order_id from projects p where p.id=r.project_id;
alter table reports enable trigger reports_integrity;

create function initialize_work_order() returns trigger language plpgsql as $$
declare wid uuid;
begin
  insert into work_orders(project_id,proposal_id,title,scope,due_on,brief_approved_version,brief_approved_at,brief_snapshot)
  values(new.id,new.proposal_id,new.title,coalesce((select array_to_string(scope_items,E'\n') from proposals where id=new.proposal_id),new.claims,''),new.due_date,
    case when new.onboarding_submitted_at is not null then 1 end,new.onboarding_submitted_at,new.service_brief) returning id into wid;
  update projects set active_work_order_id=wid where id=new.id;
  return null;
end $$;
create trigger projects_work_order after insert on projects for each row execute function initialize_work_order();

create function attach_work_order() returns trigger language plpgsql as $$
declare wid uuid; pid uuid;
begin
  if tg_op='UPDATE' then
    if new.work_order_id is distinct from old.work_order_id then raise exception 'The engagement association cannot be changed.'; end if;
    if tg_table_name='reports' then
      if new.inspection_id is not null and not exists(select 1 from inspections where id=new.inspection_id and work_order_id=new.work_order_id) then raise exception 'Choose an inspection from this engagement.'; end if;
    end if;
    return new;
  end if;
  select active_work_order_id into wid from projects where id=new.project_id for update;
  if tg_table_name='invoices' then
  if new.proposal_id is not null then
    select id into wid from work_orders where proposal_id=new.proposal_id and project_id=new.project_id;
    if wid is null then
      insert into work_orders(project_id,proposal_id,title,scope)
      select new.project_id,id,title,array_to_string(scope_items,E'\n') from proposals where id=new.proposal_id and status='accepted'
      returning id into wid;
      if wid is null then raise exception 'Accept the proposal before billing this engagement.'; end if;
      update projects set active_work_order_id=wid where id=new.project_id;
    end if;
  end if;
  end if;
  new.work_order_id:=coalesce(new.work_order_id,wid);
  select project_id into pid from work_orders where id=new.work_order_id;
  if pid is distinct from new.project_id then raise exception 'Choose an engagement from this project.'; end if;
  if tg_table_name='reports' then
    if new.inspection_id is not null and not exists(select 1 from inspections where id=new.inspection_id and work_order_id=new.work_order_id)
      then raise exception 'Choose an inspection from this engagement.'; end if;
  end if;
  return new;
end $$;
create trigger invoices_work_order before insert or update on invoices for each row execute function attach_work_order();
create trigger inspections_work_order before insert or update on inspections for each row execute function attach_work_order();
create trigger reports_work_order before insert or update on reports for each row execute function attach_work_order();

create function work_order_unlocked(wid uuid) returns boolean language sql stable as $$
  select exists(select 1 from work_orders w join projects p on p.id=w.project_id where w.id=wid and
    (p.payment_status='waived' or not exists(select 1 from invoices i where i.work_order_id=w.id and i.status='issued'
      and i.amount_kes>coalesce((select sum(case when kind='payment' then amount_kes else -amount_kes end) from payments where invoice_id=i.id),0))));
$$;
create function report_unlocked(rid uuid) returns boolean language sql stable as $$
  select coalesce((select work_order_unlocked(work_order_id) from reports where id=rid and status='published'),false);
$$;
create function file_deliverable_unlocked(fid uuid) returns boolean language sql stable as $$
  select exists(select 1 from report_evidence e join reports r on r.id=e.report_id where e.file_id=fid and r.status='published' and work_order_unlocked(r.work_order_id))
    or exists(select 1 from files f join inspections i on i.id=f.inspection_id where f.id=fid and f.category='evidence' and i.status='reviewed' and work_order_unlocked(i.work_order_id));
$$;

create table workflow_cases (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references projects(id),
  work_order_id uuid references work_orders(id), report_id uuid references reports(id), inspection_id uuid references inspections(id),
  kind text not null check(kind in ('clarification','complaint','report_correction','reschedule','scope_change','cancellation')),
  title text not null, detail text not null, status text not null default 'open' check(status in ('open','awaiting_client','accepted','resolved','declined')),
  created_by uuid not null references users(id), assigned_to uuid references users(id), due_on date not null default current_date+2,
  amount_kes integer check(amount_kes>0), proposed_date date, proposed_terms text, client_response text, resolution text, resolved_by uuid references users(id), resolved_at timestamptz,
  accepted_by uuid references users(id), accepted_at timestamptz, invoice_id uuid references invoices(id),
  reminder_at timestamptz, created_at timestamptz not null default now()
);
create unique index open_report_correction on workflow_cases(report_id) where kind='report_correction' and status='open';
create unique index one_cancellation_case on workflow_cases(project_id) where kind='cancellation' and status in ('open','awaiting_client','accepted');
create trigger work_orders_audit after insert or update or delete on work_orders for each row execute function audit_record_change();
create trigger workflow_cases_audit after insert or update or delete on workflow_cases for each row execute function audit_record_change();
alter table work_orders enable row level security;
alter table workflow_cases enable row level security;

create function brief_revision_guard() returns trigger language plpgsql as $$
begin
  if (new.service_brief,new.claims,new.location_label,new.site_access_notes) is distinct from (old.service_brief,old.claims,old.location_label,old.site_access_notes) then
    update work_orders set brief_version=brief_version+1,brief_approved_at=null,brief_approved_version=null where id=new.active_work_order_id;
  end if;
  return new;
end $$;
create trigger projects_brief_revision before update on projects for each row execute function brief_revision_guard();

create function assert_work_ready(wid uuid) returns void language plpgsql as $$
declare w work_orders;
begin
  select * into w from work_orders where id=wid;
  if w.hold_reason is not null then raise exception 'Work is on hold: %',w.hold_reason; end if;
  if w.brief_approved_version is distinct from w.brief_version then raise exception 'The analyst must approve the current brief against the agreed scope.'; end if;
end $$;
create function work_readiness_guard() returns trigger language plpgsql as $$
declare wid uuid;
begin
  if tg_op='INSERT' or (old.status is distinct from new.status and new.status in ('in_progress','submitted','reviewed')) or new.field_notes is distinct from old.field_notes then
    select coalesce(new.work_order_id,active_work_order_id) into wid from projects where id=new.project_id;
    perform assert_work_ready(wid);
  end if;
  return new;
end $$;
create trigger inspections_zz_readiness before insert or update on inspections for each row execute function work_readiness_guard();

-- Existing collection gates continue to run, with the engagement hold/review gate added.
alter function assert_collection_open(uuid) rename to assert_collection_open_baseline;
create function assert_collection_open(inspection uuid) returns void language plpgsql as $$
begin
  perform assert_collection_open_baseline(inspection);
  perform assert_work_ready((select work_order_id from inspections where id=inspection));
end $$;

create function staff_departure_guard() returns trigger language plpgsql as $$
begin
  if (new.disabled_at is not null and old.disabled_at is null) or new.role is distinct from old.role then
    if exists(select 1 from projects where stage<>'closed' and (lead_analyst_id=new.id or field_agent_id=new.id))
      or exists(select 1 from inspections where agent_id=new.id and status in ('scheduled','in_progress','submitted'))
      or exists(select 1 from requests where owner_id=new.id and status in ('submitted','in_review','proposal_sent','declined'))
      or exists(select 1 from workflow_cases where assigned_to=new.id and status in ('open','awaiting_client','accepted'))
      then raise exception 'Reassign this staff member''s open projects, visits, requests and cases before changing their access.'; end if;
  end if;
  return new;
end $$;
create trigger users_open_work before update on users for each row execute function staff_departure_guard();

-- Serialize bookings for an agent. Full-day windows overlap either half-day.
create function visit_availability_guard() returns trigger language plpgsql as $$
begin
  if new.status in ('scheduled','in_progress') and new.agent_id is not null and new.scheduled_for is not null then
    perform pg_advisory_xact_lock(hashtextextended(new.agent_id::text,0));
    if exists(select 1 from inspections i where i.id<>new.id and i.agent_id=new.agent_id and i.scheduled_for=new.scheduled_for and i.status in ('scheduled','in_progress')
      and (coalesce(i.arrival_window,'full_day') not in ('morning','afternoon') or coalesce(new.arrival_window,'full_day') not in ('morning','afternoon') or i.arrival_window=new.arrival_window))
      then raise exception 'This agent already has a visit in that arrival window. Choose another date, window or agent.'; end if;
  end if;
  if tg_op='UPDATE' and (new.scheduled_for,new.arrival_window,new.agent_id) is distinct from (old.scheduled_for,old.arrival_window,old.agent_id) then
    new.schedule_version:=old.schedule_version+1; new.client_confirmed_at:=null;
  end if;
  return new;
end $$;
create trigger inspections_availability before insert or update on inspections for each row execute function visit_availability_guard();

create function inspection_reviewer_independent(iid uuid,actor uuid) returns boolean language sql stable as $$
  select exists(select 1 from inspections i where i.id=iid and i.agent_id is distinct from actor and i.field_notes_by is distinct from actor
    and not exists(select 1 from files where inspection_id=iid and uploaded_by=actor)
    and not exists(select 1 from findings where inspection_id=iid and (created_by=actor or updated_by=actor))
    and not exists(select 1 from events e where actor_id=actor and
      ((type in ('findings.insert','findings.update','findings.delete')
        and coalesce(data->'after'->>'inspection_id',data->'before'->>'inspection_id')=iid::text)
       or (type in ('inspection_checks.insert','inspection_checks.update','inspection_checks.delete') and coalesce(data->'after'->>'inspection_id',data->'before'->>'inspection_id')=iid::text
         and coalesce(data->'after'->>'outcome',data->'before'->>'outcome','pending')<>'pending')
       or (type='inspections.update' and data->'after'->>'id'=iid::text and data->'before'->'field_notes' is distinct from data->'after'->'field_notes'))));
$$;

create function report_reviewer_independent(rid uuid,actor uuid) returns boolean language sql stable as $$
  select exists(select 1 from reports r where r.id=rid and r.author_id is distinct from actor
    and not exists(select 1 from events e where e.actor_id=actor and e.type='reports.update' and e.data->'after'->>'id'=rid::text
      and ((e.data->'before')-array['status','submitted_at','published_at','reviewer_id','snapshot','updated_at','review_exception']) is distinct from
          ((e.data->'after')-array['status','submitted_at','published_at','reviewer_id','snapshot','updated_at','review_exception'])));
$$;
create function review_exception_guard() returns trigger language plpgsql as $$
declare independent boolean; reviewer uuid;
begin
  if tg_table_name='reports' then
    if old.status<>new.status and new.status='published' then reviewer:=new.reviewer_id; independent:=report_reviewer_independent(new.id,reviewer); else return new; end if;
    if not exists(select 1 from users where id=reviewer and role='admin' and disabled_at is null) then raise exception 'Only an active admin can approve and publish a report.'; end if;
  else
    if old.status<>new.status and new.status='reviewed' then reviewer:=new.reviewed_by; independent:=inspection_reviewer_independent(new.id,reviewer); else return new; end if;
  end if;
  if not independent and (not exists(select 1 from users where id=reviewer and role='admin' and disabled_at is null) or coalesce(length(trim(new.review_exception)),0)<10)
    then raise exception 'Use an independent reviewer or record an admin review exception of at least 10 characters.'; end if;
  return new;
end $$;
create trigger reports_review_exception before update on reports for each row execute function review_exception_guard();
create trigger inspections_review_exception before update on inspections for each row execute function review_exception_guard();

-- A zero retained charge is valid only through an audited invoice revision; new invoices still require a positive fee in the application.
alter table invoices drop constraint invoices_amount_kes_check;
alter table invoices add constraint invoices_amount_kes_check check(amount_kes>=0);

create function sync_work_due_date() returns trigger language plpgsql as $$
begin
  if new.due_date is distinct from old.due_date then update work_orders set due_on=new.due_date where id=new.active_work_order_id; end if;
  return new;
end $$;
create trigger projects_work_due_date after update on projects for each row execute function sync_work_due_date();

create function invoice_due_on(iid uuid) returns date language sql stable as $$
  select case when not i.balance_on_delivery then i.due_on
    when i.deposit_kes>coalesce((select sum(case when kind='payment' then amount_kes else -amount_kes end) from payments where invoice_id=i.id),0) then i.due_on
    else (select min(published_at)::date from reports where work_order_id=i.work_order_id and status='published') end
  from invoices i where i.id=iid;
$$;
create function invoice_due_amount(iid uuid) returns integer language sql stable as $$
  select greatest(0,(case when i.balance_on_delivery and not exists(select 1 from reports where work_order_id=i.work_order_id and status='published') then i.deposit_kes else i.amount_kes end)
    -coalesce((select sum(case when kind='payment' then amount_kes else -amount_kes end) from payments where invoice_id=i.id),0))::int from invoices i where i.id=iid;
$$;

create function work_payment_status(wid uuid) returns text language sql stable as $$
  select case when p.payment_status='waived' then 'waived'
    when not exists(select 1 from invoices where work_order_id=w.id and status='issued') then p.payment_status
    when not exists(select 1 from invoices i where i.work_order_id=w.id and i.status='issued' and i.amount_kes>coalesce((select sum(case when kind='payment' then amount_kes else -amount_kes end) from payments where invoice_id=i.id),0)) then 'paid'
    when not exists(select 1 from invoices i where i.work_order_id=w.id and i.status='issued' and i.deposit_kes>coalesce((select sum(case when kind='payment' then amount_kes else -amount_kes end) from payments where invoice_id=i.id),0)) then 'deposit_received'
    else 'awaiting_payment' end from work_orders w join projects p on p.id=w.project_id where w.id=wid;
$$;

-- Fieldwork always follows its own engagement, including after switching the dashboard.
create or replace function assert_collection_open(inspection uuid) returns void language plpgsql as $$
declare i inspections; p projects;
begin
  select * into i from inspections where id=inspection for share;
  if not found then raise exception 'Inspection not found.'; end if;
  if i.status not in ('scheduled','in_progress') then raise exception 'Reopen the inspection before collecting or changing fieldwork.'; end if;
  select * into p from projects where id=i.project_id for share;
  perform assert_work_ready(i.work_order_id);
  if p.stage='closed' then raise exception 'The project is closed.'; end if;
  if p.data_consent_at is null or p.onboarding_submitted_at is null then raise exception 'Complete onboarding and consent before fieldwork.'; end if;
  if work_payment_status(i.work_order_id) not in ('deposit_received','paid','waived') then raise exception 'Record payment or a waiver before fieldwork.'; end if;
  if p.nda_status not in ('none','signed') then raise exception 'Sign the requested confidentiality agreement before fieldwork.'; end if;
  if not exists(select 1 from users where id=p.lead_analyst_id and role in ('analyst','admin') and disabled_at is null)
    or not exists(select 1 from users where id=i.agent_id and role in ('field_agent','analyst','admin') and disabled_at is null)
    then raise exception 'Assign an active lead analyst and field agent before fieldwork.'; end if;
end $$;

create or replace function inspection_workflow_guard() returns trigger language plpgsql as $$
declare p projects; reviewer uuid;
begin
  select * into p from projects where id=new.project_id;
  if tg_op = 'INSERT' or (tg_op='UPDATE' and new.status is distinct from old.status and new.status in ('in_progress','submitted','reviewed')) then
    if p.data_consent_at is null or p.onboarding_submitted_at is null then raise exception 'Complete onboarding and consent before fieldwork.'; end if;
    if work_payment_status(coalesce(new.work_order_id,p.active_work_order_id)) not in ('deposit_received','paid','waived') then raise exception 'Record payment or a waiver before fieldwork.'; end if;
    if p.lead_analyst_id is null or new.agent_id is null then raise exception 'Assign the lead analyst and field agent.'; end if;
  end if;
  if new.agent_id is not null and not exists(select 1 from users where id=new.agent_id and role in ('field_agent','analyst','admin') and disabled_at is null) then raise exception 'Choose an active staff agent.'; end if;
  if tg_op='UPDATE' then
    if old.status in ('reviewed','cancelled') and new.field_notes is distinct from old.field_notes then raise exception 'Reopen before changing field notes.'; end if;
    if old.status <> new.status and not (
      (old.status='scheduled' and new.status in ('in_progress','submitted','cancelled')) or
      (old.status='in_progress' and new.status in ('submitted','cancelled')) or
      (old.status='submitted' and new.status in ('reviewed','scheduled')) or
      (old.status in ('reviewed','cancelled') and new.status='scheduled')
    ) then raise exception 'Invalid inspection transition.'; end if;
    if old.status <> new.status and new.status in ('submitted','reviewed') then
      if not exists(select 1 from findings where inspection_id=new.id) or not exists(select 1 from files where inspection_id=new.id and category='evidence' and status='ready') then raise exception 'Findings and evidence are required.'; end if;
    end if;
    if old.status <> new.status and new.status='reviewed' then
      reviewer := new.reviewed_by;
      if reviewer is null then raise exception 'An independent reviewer is required.'; end if;
      if not exists(select 1 from users where id=reviewer and role='admin') and (reviewer=new.agent_id or reviewer=new.field_notes_by or
        exists(select 1 from findings where inspection_id=new.id and (created_by=reviewer or updated_by=reviewer)) or
        exists(select 1 from files where inspection_id=new.id and uploaded_by=reviewer)) then raise exception 'An independent reviewer is required.'; end if;
      if exists(select 1 from findings f where inspection_id=new.id and f.status <> 'unverified' and cardinality(f.evidence_ids)=0) then raise exception 'Link verified findings to supporting evidence.'; end if;
    end if;
  end if;
  return new;
end $$;
