alter table requests add column additional_locations jsonb not null default '[]';
alter table enquiries add column owner_id uuid references users(id);
alter table enquiries add column next_follow_up date;
alter table enquiries add column internal_notes text;
alter table enquiries add column request_id uuid references requests(id);
create table project_sites (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references projects(id),
  label text not null, lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180), primary_site boolean not null default false
);
alter table project_sites enable row level security;
alter table inspections add column site_id uuid references project_sites(id);
create function inspection_site_guard() returns trigger language plpgsql as $$
begin if new.site_id is not null and not exists(select 1 from project_sites where id=new.site_id and project_id=new.project_id) then raise exception 'Inspection site must belong to the project.'; end if; return new; end $$;
create trigger inspections_site before insert or update on inspections for each row execute function inspection_site_guard();

create function record_risk_alert() returns trigger language plpgsql as $$
begin
  if new.health in ('at_risk','high_risk') and (old.health is distinct from new.health or old.health_note is distinct from new.health_note) then
    insert into project_alerts(project_id,title,detail,severity,owner_id)
    values(new.id,'Project is ' || replace(new.health::text,'_',' '),coalesce(new.health_note,'Review the findings with your analyst.'),new.health::text,new.lead_analyst_id);
  end if;
  return null;
end $$;
create trigger projects_risk_alert after update on projects for each row execute function record_risk_alert();

create function nda_signed_guard() returns trigger language plpgsql as $$
begin if old.nda_status='signed' and (new.nda_status,new.nda_file_id,new.nda_signed_name,new.nda_signed_at) is distinct from (old.nda_status,old.nda_file_id,old.nda_signed_name,old.nda_signed_at) then raise exception 'Signed NDA records are immutable.'; end if; return new; end $$;
create trigger projects_nda before update on projects for each row execute function nda_signed_guard();
