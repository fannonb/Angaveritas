alter table findings add column updated_by uuid references users(id);
alter table inspections add column field_notes_by uuid references users(id);

create function findings_integrity_guard() returns trigger language plpgsql as $$
declare insp inspections; f findings; eid uuid;
begin
  if tg_op = 'DELETE' then f := old; else f := new; end if;
  select * into insp from inspections where id=f.inspection_id for update;
  if insp.status in ('reviewed','cancelled') then raise exception 'Reopen the inspection before changing findings.'; end if;
  if tg_op <> 'DELETE' then
    foreach eid in array new.evidence_ids loop
      if not exists(select 1 from files where id=eid and inspection_id=insp.id and project_id=insp.project_id and category='evidence' and status='ready') then
        raise exception 'Finding evidence must belong to the same inspection.';
      end if;
    end loop;
    if new.status in ('warn','bad') and (new.risk_category is null or new.likelihood is null or new.impact is null or coalesce(trim(new.action),'')='') then
      raise exception 'Risk findings need a category, likelihood, impact and mitigation.';
    end if;
    return new;
  end if;
  return old;
end $$;
create trigger findings_integrity before insert or update or delete on findings for each row execute function findings_integrity_guard();

create function inspection_workflow_guard() returns trigger language plpgsql as $$
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
      if reviewer is null or reviewer=new.agent_id or reviewer=new.field_notes_by or
        exists(select 1 from findings where inspection_id=new.id and (created_by=reviewer or updated_by=reviewer)) or
        exists(select 1 from files where inspection_id=new.id and uploaded_by=reviewer) then raise exception 'An independent reviewer is required.'; end if;
      if exists(select 1 from findings f where inspection_id=new.id and f.status <> 'unverified' and cardinality(f.evidence_ids)=0) then raise exception 'Link verified findings to supporting evidence.'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger inspections_workflow before insert or update on inspections for each row execute function inspection_workflow_guard();

create function report_review_guard() returns trigger language plpgsql as $$
begin
  if old.status='in_review' and new.status='in_review' and
    (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then raise exception 'Return to draft before editing an in-review report.'; end if;
  return new;
end $$;
create trigger reports_review_lock before update on reports for each row execute function report_review_guard();

create function protect_report_deletion() returns trigger language plpgsql as $$
begin if old.status in ('published','withdrawn') then raise exception 'Delivered reports must be preserved.'; end if; return old; end $$;
create trigger reports_preserve before delete on reports for each row execute function protect_report_deletion();

create function project_assignment_guard() returns trigger language plpgsql as $$
begin
  if new.lead_analyst_id is not null and not exists(select 1 from users where id=new.lead_analyst_id and role in ('analyst','admin') and disabled_at is null) then raise exception 'Assign an active analyst or admin as lead.'; end if;
  if new.field_agent_id is not null and not exists(select 1 from users where id=new.field_agent_id and role in ('field_agent','analyst','admin') and disabled_at is null) then raise exception 'Assign an active staff field agent.'; end if;
  if tg_op='UPDATE' and old.stage <> new.stage then
    if new.stage='planning' and (new.onboarding_submitted_at is null or new.data_consent_at is null) then raise exception 'Complete onboarding and consent first.'; end if;
    if new.stage='fieldwork' and (new.payment_status not in ('deposit_received','paid','waived') or new.data_consent_at is null or new.onboarding_submitted_at is null) then raise exception 'Fieldwork requires consent, onboarding and payment.'; end if;
    if new.stage in ('delivered','monitoring') and not exists(select 1 from reports where project_id=new.id and status='published') then raise exception 'Publish a reviewed report before delivery.'; end if;
  end if;
  return new;
end $$;
create trigger projects_assignment before insert or update on projects for each row execute function project_assignment_guard();
