-- Report approval: only an active admin can approve and publish a report. An admin may publish
-- a report they wrote or edited, so admins keep full control. Reports by every other role need
-- an admin's approval. Inspection review rules are unchanged.

create or replace function report_integrity_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.status in ('published', 'withdrawn') then
    if (to_jsonb(new) - array['status','withdrawal_reason','client_rating','client_feedback','updated_at'])
       is distinct from (to_jsonb(old) - array['status','withdrawal_reason','client_rating','client_feedback','updated_at']) then
      raise exception 'Published report content is immutable. Create a corrected version.';
    end if;
    if new.status <> old.status and not (old.status = 'published' and new.status = 'withdrawn') then
      raise exception 'A delivered report cannot be reopened.';
    end if;
    return new;
  end if;
  if new.inspection_id is not null and not exists (
    select 1 from inspections where id = new.inspection_id and project_id = new.project_id and status = 'reviewed'
  ) then raise exception 'Reports require a reviewed inspection from the same project.'; end if;
  if new.pdf_file_id is not null and not exists (
    select 1 from files where id = new.pdf_file_id and project_id = new.project_id and category = 'report' and status = 'ready'
  ) then raise exception 'Attach a ready report PDF from the same project.'; end if;
  if new.supersedes_id is not null and not exists (
    select 1 from reports where id = new.supersedes_id and project_id = new.project_id and status = 'withdrawn'
  ) then raise exception 'A corrected report must replace a withdrawn report from the same project.'; end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    if new.snapshot is null or new.reviewer_id is null then
      raise exception 'Publication requires a snapshot and an admin approval.';
    end if;
  end if;
  return new;
end $$;

create or replace function reviewer_role_guard() returns trigger language plpgsql as $$
declare reviewer uuid;
begin
  if tg_table_name='reports' and new.status::text='published' and old.status <> new.status then
    reviewer := new.reviewer_id;
    if not exists(select 1 from users where id=reviewer and role='admin' and disabled_at is null) then raise exception 'Only an active admin can approve and publish a report.'; end if;
  elsif tg_table_name='inspections' and new.status::text='reviewed' and old.status <> new.status then
    reviewer := new.reviewed_by;
    if not exists(select 1 from users where id=reviewer and role in ('analyst','admin') and disabled_at is null) then raise exception 'An active analyst or admin must review.'; end if;
  end if;
  return new;
end $$;

-- Only inspections keep the contributor check now; reports are approved by an admin, who may have edited them.
drop trigger if exists reports_contributor_review on reports;

create or replace function contribution_review_guard() returns trigger language plpgsql as $$
declare reviewer uuid;
begin
  if old.status<>new.status and new.status::text='reviewed' then
    reviewer:=new.reviewed_by;
    if exists(select 1 from events e where e.actor_id=reviewer and (
      (e.type in ('findings.insert','findings.update','findings.delete') and coalesce(e.data->'after'->>'inspection_id',e.data->'before'->>'inspection_id')=new.id::text) or
      (e.type='inspections.update' and e.data->'after'->>'id'=new.id::text and e.data->'before'->'field_notes' is distinct from e.data->'after'->'field_notes')))
      then raise exception 'An independent reviewer who has not contributed fieldwork must approve.'; end if;
  end if;
  return new;
end $$;
