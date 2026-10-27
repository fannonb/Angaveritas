-- Website settings that staff change from the app, e.g. whether public pages show prices.
create table site_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references users (id) on delete set null,
  updated_at  timestamptz not null default now()
);
alter table site_settings enable row level security;
