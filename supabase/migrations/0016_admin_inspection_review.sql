-- Inspection review: an admin may review a visit they carried out or checked themselves. Other
-- reviewers stay independent of the fieldwork (the field agent and anyone who contributed).

create or replace function inspection_workflow_guard() returns trigger language plpgsql as $$
declare p projects; reviewer uuid;
begin
  select * into p from projects where id=new.project_id;
  if tg_op = 'INSERT' or (tg_op='UPDATE' and new.status is distinct from old.status and new.status in ('in_progress','submitted','reviewed')) then
    if p.data_consent_at is null or p.onboarding_submitted_at is null then raise exception 'Complete onboarding and consent before fieldwork.'; end if;
    if p.payment_status not in ('deposit_received','paid','waived') then raise exception 'Record payment or a waiver before fieldwork.'; end if;
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

create or replace function inspection_completion_guard() returns trigger language plpgsql as $$
begin
  if old.status is distinct from new.status and new.status in ('submitted','reviewed') then
    if exists(select 1 from inspection_checks where inspection_id=new.id and required and outcome='pending')
      then raise exception 'Complete every required check, or explain why it could not be checked or needs another visit.'; end if;
    if new.status='reviewed' and not exists(select 1 from users where id=new.reviewed_by and role='admin') and exists(select 1 from events where actor_id=new.reviewed_by
      and type in ('inspection_checks.insert','inspection_checks.update','inspection_checks.delete')
      and coalesce(data->'after'->>'inspection_id',data->'before'->>'inspection_id')=new.id::text
      and (data->'before'->'outcome',data->'before'->'note',data->'before'->'evidence_ids') is distinct from
          (data->'after'->'outcome',data->'after'->'note',data->'after'->'evidence_ids')
      and coalesce(data->'after'->>'outcome',data->'before'->>'outcome','pending')<>'pending')
      then raise exception 'An independent reviewer who has not completed field checks must approve.'; end if;
  end if;
  return new;
end $$;

create or replace function contribution_review_guard() returns trigger language plpgsql as $$
declare reviewer uuid;
begin
  if old.status<>new.status and new.status::text='reviewed' then
    reviewer:=new.reviewed_by;
    if not exists(select 1 from users where id=reviewer and role='admin') and exists(select 1 from events e where e.actor_id=reviewer and (
      (e.type in ('findings.insert','findings.update','findings.delete') and coalesce(e.data->'after'->>'inspection_id',e.data->'before'->>'inspection_id')=new.id::text) or
      (e.type='inspections.update' and e.data->'after'->>'id'=new.id::text and e.data->'before'->'field_notes' is distinct from e.data->'after'->'field_notes')))
      then raise exception 'An independent reviewer who has not contributed fieldwork must approve.'; end if;
  end if;
  return new;
end $$;
