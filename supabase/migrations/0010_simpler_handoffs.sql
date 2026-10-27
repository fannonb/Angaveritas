-- A view receipt is separate from optional feedback and immutable report content.
create table report_reads (
  report_id uuid not null references reports(id),
  user_id uuid not null references users(id),
  first_viewed_at timestamptz not null default now(),
  primary key(report_id,user_id)
);

-- Keep signed-NDA promises at the same boundary as payment and consent.
create or replace function assert_collection_open(inspection uuid) returns void language plpgsql as $$
declare i inspections; p projects;
begin
  select * into i from inspections where id=inspection for share;
  if not found then raise exception 'Inspection not found.'; end if;
  if i.status not in ('scheduled','in_progress') then raise exception 'Reopen the inspection before collecting or changing fieldwork.'; end if;
  select * into p from projects where id=i.project_id for share;
  if p.stage='closed' then raise exception 'The project is closed.'; end if;
  if p.data_consent_at is null or p.onboarding_submitted_at is null then raise exception 'Complete onboarding and consent before fieldwork.'; end if;
  if p.payment_status not in ('deposit_received','paid','waived') then raise exception 'Record payment or a waiver before fieldwork.'; end if;
  if p.nda_status not in ('none','signed') then raise exception 'Sign the requested confidentiality agreement before fieldwork.'; end if;
  if not exists(select 1 from users where id=p.lead_analyst_id and role in ('analyst','admin') and disabled_at is null)
    or not exists(select 1 from users where id=i.agent_id and role in ('field_agent','analyst','admin') and disabled_at is null)
    then raise exception 'Assign an active lead analyst and field agent before fieldwork.'; end if;
end $$;

create function inspection_nda_guard() returns trigger language plpgsql as $$
begin
  if (tg_op='INSERT' or new.status is distinct from old.status) and new.status in ('scheduled','in_progress','submitted','reviewed')
    and exists(select 1 from projects where id=new.project_id and nda_status not in ('none','signed'))
    then raise exception 'Sign the requested confidentiality agreement before fieldwork.'; end if;
  return new;
end $$;
create trigger inspections_nda before insert or update on inspections for each row execute function inspection_nda_guard();

create table inspection_checks (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id),
  label text not null check(length(trim(label)) between 1 and 8000),
  position integer not null,
  required boolean not null default true,
  outcome text not null default 'pending' check(outcome in ('pending','checked','could_not_check','another_visit')),
  note text not null default '',
  evidence_ids uuid[] not null default '{}',
  updated_by uuid references users(id),
  updated_at timestamptz not null default now(),
  unique(inspection_id,label)
);

create function check_collection_guard() returns trigger language plpgsql as $$
declare eid uuid;
begin
  if tg_op='DELETE' then perform assert_collection_open(old.inspection_id); return old; end if;
  if tg_op='UPDATE' and new.inspection_id<>old.inspection_id then raise exception 'Check inspection cannot be changed.'; end if;
  perform assert_collection_open(new.inspection_id);
  if new.outcome<>'pending' and length(trim(new.note))<3 then raise exception 'Describe the result or why the check could not be completed.'; end if;
  if new.outcome='checked' and cardinality(new.evidence_ids)=0 then raise exception 'Link evidence for a completed check.'; end if;
  foreach eid in array new.evidence_ids loop
    if not exists(select 1 from files where id=eid and inspection_id=new.inspection_id and category='evidence' and status='ready')
      then raise exception 'Check evidence must belong to this visit.'; end if;
  end loop;
  new.updated_at:=now();
  return new;
end $$;
create trigger inspection_checks_collection before insert or update or delete on inspection_checks for each row execute function check_collection_guard();
create trigger inspection_checks_audit after insert or update or delete on inspection_checks for each row execute function audit_record_change();

-- Required checks are created from the analyst's one-item-per-line visit plan.
-- Completed records survive plan changes; removed items stop being required.
create function sync_inspection_checks() returns trigger language plpgsql as $$
declare line text; pos integer:=0; labels text[]:='{}';
begin
  if tg_op='UPDATE' and new.objectives is not distinct from old.objectives then return null; end if;
  if new.status not in ('scheduled','in_progress') then return null; end if;
  for line in select trim(regexp_replace(v,'^[-•*][[:space:]]*','')) from regexp_split_to_table(coalesce(new.objectives,''), E'\n') v loop
    if line='' or right(line,1)=':' or line=any(labels) then continue; end if;
    labels:=array_append(labels,line); pos:=pos+1;
    insert into inspection_checks(inspection_id,label,position) values(new.id,line,pos)
      on conflict(inspection_id,label) do update set required=true,position=excluded.position;
  end loop;
  update inspection_checks set required=false where inspection_id=new.id and not(label=any(labels));
  return null;
end $$;
create trigger inspections_check_plan after insert or update on inspections for each row execute function sync_inspection_checks();

create function inspection_completion_guard() returns trigger language plpgsql as $$
begin
  if old.status is distinct from new.status and new.status in ('submitted','reviewed') then
    if exists(select 1 from inspection_checks where inspection_id=new.id and required and outcome='pending')
      then raise exception 'Complete every required check, or explain why it could not be checked or needs another visit.'; end if;
    if new.status='reviewed' and exists(select 1 from events where actor_id=new.reviewed_by
      and type in ('inspection_checks.insert','inspection_checks.update','inspection_checks.delete')
      and coalesce(data->'after'->>'inspection_id',data->'before'->>'inspection_id')=new.id::text
      and (data->'before'->'outcome',data->'before'->'note',data->'before'->'evidence_ids') is distinct from
          (data->'after'->'outcome',data->'after'->'note',data->'after'->'evidence_ids')
      and coalesce(data->'after'->>'outcome',data->'before'->>'outcome','pending')<>'pending')
      then raise exception 'An independent reviewer who has not completed field checks must approve.'; end if;
  end if;
  return new;
end $$;
create trigger inspections_check_completion before update on inspections for each row execute function inspection_completion_guard();

create function preserve_check_evidence() returns trigger language plpgsql as $$
begin
  if exists(select 1 from inspection_checks where old.id=any(evidence_ids)) then raise exception 'Unlink this evidence from its visit checks before deleting it.'; end if;
  return old;
end $$;
create trigger files_check_references before delete on files for each row execute function preserve_check_evidence();

-- Corrections have an owner, due date, and an explicit resolution.
create table inspection_corrections (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id),
  check_id uuid references inspection_checks(id),
  reason text not null check(length(trim(reason)) between 5 and 4000),
  requested_by uuid not null references users(id),
  assigned_to uuid not null references users(id),
  due_on date,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references users(id),
  resolution text
);

create function correction_completion_guard() returns trigger language plpgsql as $$
begin
  if old.status is distinct from new.status and new.status in ('submitted','reviewed')
    and exists(select 1 from inspection_corrections where inspection_id=new.id and resolved_at is null)
    then raise exception 'Respond to each requested correction before sending the visit for review.'; end if;
  return new;
end $$;
create trigger inspections_corrections_complete before update on inspections for each row execute function correction_completion_guard();

-- App tables have no public browser access; all reads use authenticated server code.
alter table report_reads enable row level security;
alter table inspection_checks enable row level security;
alter table inspection_corrections enable row level security;
