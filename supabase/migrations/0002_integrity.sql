-- Report publication is a durable snapshot; relationships are checked in the DB.
alter table reports add column scope text not null default '';
alter table reports add column methodology text not null default '';
alter table reports add column snapshot jsonb;
alter table reports add column supersedes_id uuid references reports(id);
alter table reports add column withdrawal_reason text;
alter table files add column field_access boolean not null default false;
alter table files add column qa_note text;
alter table files add column qa_by uuid references users(id);
alter table files add column qa_at timestamptz;
alter table findings add column evidence_ids uuid[] not null default '{}';
alter table findings add column risk_category text;
alter table findings add column likelihood smallint check (likelihood between 1 and 5);
alter table findings add column impact smallint check (impact between 1 and 5);

create table report_evidence (
  report_id uuid not null references reports(id),
  file_id uuid not null references files(id),
  primary key (report_id, file_id)
);
alter table report_evidence enable row level security;

-- Freeze valid legacy reports at the migration baseline; foreign and
-- unreviewed inspections are excluded from client snapshots.
update reports r set snapshot = jsonb_build_object(
  'project', (select to_jsonb(p) || jsonb_build_object('client_name',c.full_name) from projects p join users c on c.id=p.client_id where p.id=r.project_id),
  'report', to_jsonb(r) - 'snapshot' || jsonb_build_object('author_name',(select full_name from users where id=r.author_id),'reviewer_name',(select full_name from users where id=r.reviewer_id)),
  'findings', coalesce((select jsonb_agg(to_jsonb(f) order by f.inspection_id,f.position,f.id) from findings f join inspections i on i.id=f.inspection_id where i.project_id=r.project_id and i.status='reviewed' and (r.inspection_id is null or i.id=r.inspection_id)), '[]'::jsonb),
  'evidence', coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from files f join inspections i on i.id=f.inspection_id where f.project_id=r.project_id and i.project_id=r.project_id and i.status='reviewed' and (r.inspection_id is null or i.id=r.inspection_id) and f.category='evidence' and f.status='ready' and f.visible_to_client), '[]'::jsonb)
) where r.status in ('published','withdrawn') and (r.inspection_id is null or exists(select 1 from inspections where id=r.inspection_id and project_id=r.project_id and status='reviewed'));
insert into report_evidence(report_id,file_id)
select r.id,(e->>'id')::uuid from reports r cross join lateral jsonb_array_elements(r.snapshot->'evidence') e;
insert into report_evidence(report_id,file_id) select id,pdf_file_id from reports where snapshot is not null and pdf_file_id is not null on conflict do nothing;

create function report_integrity_guard() returns trigger language plpgsql as $$
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
    if new.snapshot is null or new.author_id = new.reviewer_id or new.reviewer_id is null then
      raise exception 'Publication requires a snapshot and an independent reviewer.';
    end if;
  end if;
  return new;
end $$;
create trigger reports_integrity before insert or update on reports for each row execute function report_integrity_guard();

create function file_inspection_guard() returns trigger language plpgsql as $$
begin
  if new.inspection_id is not null and not exists (
    select 1 from inspections where id = new.inspection_id and project_id = new.project_id
  ) then raise exception 'The file inspection must belong to its project.'; end if;
  if tg_op = 'UPDATE' and old.status = 'ready' and
    (new.storage_key, new.sha256, new.project_id, new.inspection_id, new.category, new.mime)
    is distinct from (old.storage_key, old.sha256, old.project_id, old.inspection_id, old.category, old.mime) then
    raise exception 'Stored file identity is immutable.';
  end if;
  if tg_op = 'UPDATE' and old.visible_to_client and not new.visible_to_client and new.category = 'evidence'
    and exists (select 1 from report_evidence e join reports r on r.id=e.report_id where e.file_id=new.id and r.status='published') then
    raise exception 'Evidence in a published report must remain accessible.';
  end if;
  return new;
end $$;
create trigger files_integrity before insert or update on files for each row execute function file_inspection_guard();

-- Historic events retain their original content. New events form a hash chain.
alter table events add column previous_hash text;
alter table events add column event_hash text;
create function hash_event() returns trigger language plpgsql as $$
begin
  perform pg_advisory_xact_lock(710012);
  new.id := nextval(pg_get_serial_sequence('events','id'));
  select event_hash into new.previous_hash from events where event_hash is not null order by id desc limit 1;
  new.event_hash := encode(digest(coalesce(new.previous_hash,'') ||
    (to_jsonb(new) - 'event_hash')::text, 'sha256'), 'hex');
  return new;
end $$;
create trigger events_hash before insert on events for each row execute function hash_event();
create function immutable_event() returns trigger language plpgsql as $$
begin raise exception 'Audit events cannot be modified or deleted.'; end $$;
create trigger events_immutable before update or delete on events for each row execute function immutable_event();

create function audit_record_change() returns trigger language plpgsql as $$
declare before_data jsonb; after_data jsonb; actor uuid; pid uuid; rid uuid;
begin
  if tg_op <> 'INSERT' then before_data := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then after_data := to_jsonb(new); end if;
  if before_data is not distinct from after_data then return null; end if;
  actor := nullif(current_setting('app.actor_id', true),'')::uuid;
  if tg_table_name = 'projects' then pid := coalesce(after_data,before_data)->>'id';
  elsif tg_table_name = 'requests' then rid := coalesce(after_data,before_data)->>'id';
  elsif tg_table_name = 'findings' then
    select project_id into pid from inspections where id = (coalesce(after_data,before_data)->>'inspection_id')::uuid;
  else
    pid := nullif(coalesce(after_data,before_data)->>'project_id','')::uuid;
    rid := nullif(coalesce(after_data,before_data)->>'request_id','')::uuid;
  end if;
  insert into events(actor_id,project_id,request_id,type,summary,data,ip_hash)
  values(actor,pid,rid,tg_table_name || '.' || lower(tg_op),tg_table_name || ' ' || lower(tg_op),
    jsonb_build_object('before',before_data,'after',after_data), nullif(current_setting('app.ip_hash',true),''));
  return null;
end $$;
do $$ declare t text; begin
  foreach t in array array['projects','requests','proposals','inspections','findings','files','reports','project_contacts','enquiries'] loop
    execute format('create trigger %I after insert or update or delete on %I for each row execute function audit_record_change()',t || '_audit',t);
  end loop;
end $$;
