-- A normalized catalog enforces country/subdivision membership in PostgreSQL.
create table location_countries (code text primary key, name text not null, subdivision_label text not null);
create table location_regions (
  country_code text not null references location_countries(code),
  code text not null, name text not null, primary key(country_code,code)
);
alter table location_countries enable row level security;
alter table location_regions enable row level security;

create temporary table av_location_seed(payload jsonb) on commit drop;
insert into av_location_seed values ($locations$__LOCATION_DATA__$locations$::jsonb);
insert into location_countries(code,name,subdivision_label)
  select c->>'code',c->>'name',c->>'label' from av_location_seed cross join lateral jsonb_array_elements(payload) c;
insert into location_regions(country_code,code,name)
  select c->>'code',r->>'code',r->>'name' from av_location_seed cross join lateral jsonb_array_elements(payload) c
  cross join lateral jsonb_array_elements(c->'regions') r;
drop table av_location_seed;

-- Keep legacy free-text locations; do not infer a country/county from a city.
alter table users add column country_code text, add column region_code text;
alter table users add constraint users_location_fk foreign key(country_code,region_code)
  references location_regions(country_code,code) match full;
create index users_location_idx on users(country_code,region_code);

create function enforce_account_location() returns trigger language plpgsql set search_path from current as $$
declare country_name text; region_name text;
begin
  if new.country_code is null or new.region_code is null then
    -- Old clients may still sign in and receive updates while completing their
    -- location. Newly created clients must always have a structured location.
    if new.role='client' then
      if tg_op='INSERT' then raise exception 'Choose your country and subdivision.'; end if;
      if old.role<>'client' or old.country_code is not null then raise exception 'Choose your country and subdivision.'; end if;
    end if;
    return new;
  end if;
  select c.name,r.name into country_name,region_name from location_countries c
    join location_regions r on r.country_code=c.code where c.code=new.country_code and r.code=new.region_code;
  if not found then raise exception 'Choose a subdivision belonging to your selected country.'; end if;
  new.based_in := case when region_name=country_name then country_name else region_name || ', ' || country_name end;
  return new;
end $$;
create trigger users_location before insert or update of country_code,region_code,role on users
  for each row execute function enforce_account_location();
