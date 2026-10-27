-- Collection must remain authorised throughout an inspection, including uploads
-- started before a reassignment, withdrawal, payment change or submission.
create function assert_collection_open(inspection uuid) returns void language plpgsql as $$
declare i inspections; p projects;
begin
  select * into i from inspections where id=inspection for share;
  if not found then raise exception 'Inspection not found.'; end if;
  if i.status not in ('scheduled','in_progress') then raise exception 'Reopen the inspection before collecting or changing fieldwork.'; end if;
  select * into p from projects where id=i.project_id for share;
  if p.stage='closed' then raise exception 'The project is closed.'; end if;
  if p.data_consent_at is null or p.onboarding_submitted_at is null then raise exception 'Complete onboarding and consent before fieldwork.'; end if;
  if p.payment_status not in ('deposit_received','paid','waived') then raise exception 'Record payment or a waiver before fieldwork.'; end if;
  if not exists(select 1 from users where id=p.lead_analyst_id and role in ('analyst','admin') and disabled_at is null)
    or not exists(select 1 from users where id=i.agent_id and role in ('field_agent','analyst','admin') and disabled_at is null)
    then raise exception 'Assign an active lead analyst and field agent before fieldwork.'; end if;
end $$;

create function finding_collection_guard() returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' then perform assert_collection_open(old.inspection_id); return old; end if;
  if tg_op='UPDATE' and new.inspection_id<>old.inspection_id then raise exception 'Finding inspection cannot be changed.'; end if;
  perform assert_collection_open(new.inspection_id);
  return new;
end $$;
create trigger findings_collection before insert or update or delete on findings for each row execute function finding_collection_guard();

create function inspection_collection_guard() returns trigger language plpgsql as $$
begin
  if new.field_notes is distinct from old.field_notes then perform assert_collection_open(old.id); end if;
  if old.status in ('submitted','reviewed','cancelled') and
    (new.title,new.agent_id,new.scheduled_for,new.objectives,new.site_id) is distinct from
    (old.title,old.agent_id,old.scheduled_for,old.objectives,old.site_id)
    then raise exception 'Reopen the inspection before changing its plan.'; end if;
  return new;
end $$;
create trigger inspections_collection before update on inspections for each row execute function inspection_collection_guard();

create function evidence_collection_guard() returns trigger language plpgsql as $$
declare uploader users; i inspections;
begin
  if new.category='evidence' and (tg_op='INSERT' or (old.status='pending' and new.status='ready')) then
    if new.inspection_id is null then raise exception 'Evidence requires an inspection.'; end if;
    perform assert_collection_open(new.inspection_id);
    select * into uploader from users where id=new.uploaded_by;
    select * into i from inspections where id=new.inspection_id;
    if uploader.disabled_at is not null or uploader.role='client' or (uploader.role='field_agent' and i.agent_id is distinct from uploader.id)
      then raise exception 'The uploader is no longer assigned to this inspection.'; end if;
  end if;
  return new;
end $$;
create trigger files_collection before insert or update on files for each row execute function evidence_collection_guard();

create function preserve_finding_evidence() returns trigger language plpgsql as $$
begin
  if exists(select 1 from findings where old.id=any(evidence_ids)) then
    raise exception 'Unlink this evidence from its findings before deleting it.';
  end if;
  return old;
end $$;
create trigger files_finding_references before delete on files for each row execute function preserve_finding_evidence();

create function hide_reopened_evidence() returns trigger language plpgsql as $$
begin
  if old.status='reviewed' and new.status='scheduled' then
    update files f set visible_to_client=false where inspection_id=new.id and category='evidence' and visible_to_client
      and not exists(select 1 from report_evidence e join reports r on r.id=e.report_id where e.file_id=f.id and r.status='published');
  end if;
  return null;
end $$;
create trigger inspections_reopened_evidence after update on inspections for each row execute function hide_reopened_evidence();

-- Check the permanent contribution history, rather than only the most recent
-- editor, so a later edit cannot make an earlier contributor an independent QA.
create function contribution_review_guard() returns trigger language plpgsql as $$
declare reviewer uuid;
begin
  if tg_table_name='reports' and old.status<>new.status and new.status::text='published' then
    reviewer:=new.reviewer_id;
    if exists(select 1 from events e where e.actor_id=reviewer and e.type='reports.update' and e.data->'after'->>'id'=new.id::text
      and ((e.data->'before') - array['status','submitted_at','published_at','reviewer_id','snapshot','updated_at']) is distinct from
          ((e.data->'after') - array['status','submitted_at','published_at','reviewer_id','snapshot','updated_at']))
      then raise exception 'An independent reviewer who has not contributed report content must approve.'; end if;
  elsif tg_table_name='inspections' and old.status<>new.status and new.status::text='reviewed' then
    reviewer:=new.reviewed_by;
    if exists(select 1 from events e where e.actor_id=reviewer and (
      (e.type in ('findings.insert','findings.update','findings.delete') and coalesce(e.data->'after'->>'inspection_id',e.data->'before'->>'inspection_id')=new.id::text) or
      (e.type='inspections.update' and e.data->'after'->>'id'=new.id::text and e.data->'before'->'field_notes' is distinct from e.data->'after'->'field_notes')))
      then raise exception 'An independent reviewer who has not contributed fieldwork must approve.'; end if;
  end if;
  return new;
end $$;
create trigger reports_contributor_review before update on reports for each row execute function contribution_review_guard();
create trigger inspections_contributor_review before update on inspections for each row execute function contribution_review_guard();
