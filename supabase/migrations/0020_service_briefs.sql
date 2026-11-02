-- Existing preparation and consent records remain valid. New/edited briefs use
-- a server-selected, versioned service profile alongside the shared logistics.
alter table projects add column service_brief jsonb not null default '{}'::jsonb
  check (jsonb_typeof(service_brief)='object' and octet_length(service_brief::text)<=65536);
