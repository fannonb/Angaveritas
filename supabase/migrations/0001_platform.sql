-- AngaVeritas platform schema.
--
-- Follows the customer journey: request (inquiry) → proposal (scope & contract)
-- → project (onboarding, planning, fieldwork, analysis, delivery, monitoring).
-- Runs on Supabase or any PostgreSQL 13+. The app connects server-side only
-- (DATABASE_URL). Row-level security is enabled on every table with no
-- policies, so Supabase's public REST API exposes nothing.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- People and sign-in
-- ---------------------------------------------------------------------------

create type user_role as enum ('client', 'field_agent', 'analyst', 'admin');

create table users (
  id                uuid primary key default gen_random_uuid(),
  email             text not null unique check (email = lower(email)),
  password_hash     text,                     -- null until an invited user sets a password
  full_name         text not null,
  phone             text,
  based_in          text,                     -- where the client lives (diaspora or local)
  timezone          text not null default 'Africa/Nairobi',
  role              user_role not null default 'client',
  email_verified_at timestamptz,
  disabled_at       timestamptz,
  consent_at        timestamptz,              -- KDPA: consent to processing, captured at registration
  last_login_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table sessions (
  id          text primary key,               -- sha256 of the cookie token; the token itself is never stored
  user_id     uuid not null references users (id) on delete cascade,
  expires_at  timestamptz not null,
  ip_hash     text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index sessions_user_idx on sessions (user_id);

create type token_purpose as enum ('verify_email', 'reset_password', 'invite');

create table user_tokens (
  id          text primary key,               -- sha256 of the emailed token
  user_id     uuid not null references users (id) on delete cascade,
  purpose     token_purpose not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index user_tokens_user_idx on user_tokens (user_id, purpose);

create table login_attempts (
  id          bigint generated always as identity primary key,
  email       text not null,
  ip_hash     text,
  ok          boolean not null,
  created_at  timestamptz not null default now()
);
create index login_attempts_email_idx on login_attempts (email, created_at desc);
create index login_attempts_ip_idx on login_attempts (ip_hash, created_at desc);

-- ---------------------------------------------------------------------------
-- Pricing (versioned; every saved request keeps the version it was priced with)
-- ---------------------------------------------------------------------------

create table pricing_versions (
  id          bigint generated always as identity primary key,
  config      jsonb not null,
  note        text,
  created_by  uuid references users (id),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Stage 2: inquiries
-- ---------------------------------------------------------------------------

-- General website enquiries (contact form). No account needed.
create table enquiries (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  email            text not null,
  phone            text,
  preferred_contact text,
  based_in         text,
  company          text,
  service          text,
  project_location text,
  message          text not null,
  status           text not null default 'new' check (status in ('new', 'replied', 'converted', 'closed')),
  user_id          uuid references users (id) on delete set null,
  ip_hash          text,
  consent_at       timestamptz not null,
  created_at       timestamptz not null default now()
);
create index enquiries_created_idx on enquiries (created_at desc);

create type request_status as enum ('submitted', 'in_review', 'proposal_sent', 'accepted', 'declined', 'withdrawn', 'closed');

create sequence request_number_seq start 1001;

-- A client's request for work: from the calculator, a custom brief, or a
-- follow-up inspection on an existing project.
create table requests (
  id                     uuid primary key default gen_random_uuid(),
  reference              text not null unique default ('AVR-' || nextval('request_number_seq')),
  client_id              uuid not null references users (id),
  kind                   text not null check (kind in ('estimate', 'custom', 'follow_up')),
  status                 request_status not null default 'submitted',
  parent_project_id      uuid,                -- set for follow-up requests (FK added below)

  -- The client's own words (needs assessment)
  title                  text not null,
  description            text,
  claims                 text,                -- what the client has been told and wants checked
  concerns               text,                -- what worries them
  investment_band        text,
  decision_timeline      text,

  -- Calculator inputs
  service_code           text,
  service_name           text,
  location_label         text,
  location_lat           double precision check (location_lat between -90 and 90),
  location_lng           double precision check (location_lng between -180 and 180),
  distance_km_one_way    numeric(8, 1),
  distance_km_round_trip numeric(8, 1),
  distance_method        text check (distance_method in ('road', 'estimate', 'none')),
  complexity_answers     smallint[],
  complexity_score       smallint check (complexity_score between 5 and 15),
  complexity_tier        text,
  addon_codes            text[] not null default '{}',
  urgency_code           text,

  -- Estimate, frozen at submission
  breakdown              jsonb,
  total_kes              integer check (total_kes >= 0),
  total_kes_max          integer check (total_kes_max >= 0),
  pricing_version_id     bigint references pricing_versions (id),

  -- Staff qualification (stage 2, internal)
  priority               text check (priority in ('high', 'normal', 'low')),
  owner_id               uuid references users (id),

  ip_hash                text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index requests_client_idx on requests (client_id, created_at desc);
create index requests_status_idx on requests (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Stage 3: proposals (scope of work, price, terms, acceptance)
-- ---------------------------------------------------------------------------

create type proposal_status as enum ('draft', 'sent', 'accepted', 'declined', 'superseded');

create table proposals (
  id               uuid primary key default gen_random_uuid(),
  request_id       uuid not null references requests (id) on delete cascade,
  version          integer not null,
  status           proposal_status not null default 'draft',
  title            text not null,
  objectives       text not null,             -- what the engagement will answer
  scope_items      text[] not null default '{}',
  deliverables     text[] not null default '{}',
  exclusions       text,                      -- what is not covered (limitations)
  timeline         text not null,
  line_items       jsonb not null default '[]',   -- [{label, detail?, amount}]
  total_kes        integer not null check (total_kes >= 0),
  payment_terms    text not null,
  valid_until      date,
  terms_version    text not null,
  nda_offered      boolean not null default true,
  created_by       uuid references users (id),
  created_at       timestamptz not null default now(),
  sent_at          timestamptz,
  responded_at     timestamptz,
  accepted_name    text,                      -- typed signature
  nda_requested    boolean,
  decline_reason   text,
  response_ip_hash text,
  unique (request_id, version)
);

-- ---------------------------------------------------------------------------
-- Stages 4–10: projects
-- ---------------------------------------------------------------------------

create type project_stage as enum ('onboarding', 'planning', 'fieldwork', 'analysis', 'delivered', 'monitoring', 'closed');
create type health_status as enum ('not_assessed', 'on_track', 'at_risk', 'high_risk');

create sequence project_number_seq start 101;

create table projects (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique default ('AVP-' || nextval('project_number_seq')),
  client_id         uuid not null references users (id),
  request_id        uuid references requests (id),
  proposal_id       uuid references proposals (id),
  title             text not null,
  service_code      text,
  service_name      text,
  engagement        text not null default 'one_off' check (engagement in ('one_off', 'retainer')),
  stage             project_stage not null default 'onboarding',
  health            health_status not null default 'not_assessed',
  health_note       text,

  -- Site
  location_label    text,
  county            text,
  location_lat      double precision,
  location_lng      double precision,
  site_directions   text,
  site_access_notes text,

  -- What the client has been told (the claims we verify) and context
  claims            text,
  concerns          text,
  investment_value_kes bigint,

  -- Onboarding (client)
  onboarding_submitted_at timestamptz,
  data_consent_at   timestamptz,

  -- Assignment (internal)
  lead_analyst_id   uuid references users (id),
  field_agent_id    uuid references users (id),
  planning_notes    text,                     -- internal only: desk research, route, risk indicators

  -- Commercial
  contract_value_kes integer,
  payment_status    text not null default 'awaiting_payment' check (payment_status in ('awaiting_payment', 'deposit_received', 'paid', 'waived')),

  start_date        date,
  due_date          date,
  closed_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index projects_client_idx on projects (client_id, created_at desc);
create index projects_stage_idx on projects (stage);
create index projects_agent_idx on projects (field_agent_id);
create index projects_analyst_idx on projects (lead_analyst_id);

alter table requests add constraint requests_parent_project_fk foreign key (parent_project_id) references projects (id) on delete set null;

-- People connected to the site: sellers, contractors, caretakers, suppliers.
create table project_contacts (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects (id) on delete cascade,
  name        text not null,
  role        text,
  phone       text,
  email       text,
  notes       text,
  may_contact boolean not null default true,  -- client permits us to contact this person
  created_by  uuid references users (id),
  created_at  timestamptz not null default now()
);
create index project_contacts_project_idx on project_contacts (project_id);

-- ---------------------------------------------------------------------------
-- Stages 5–7: inspections, findings, evidence
-- ---------------------------------------------------------------------------

create type inspection_status as enum ('scheduled', 'in_progress', 'submitted', 'reviewed', 'cancelled');

create sequence inspection_number_seq start 1;

create table inspections (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects (id) on delete cascade,
  code             text not null unique default ('AVI-' || lpad(nextval('inspection_number_seq')::text, 4, '0')),
  title            text not null,
  status           inspection_status not null default 'scheduled',
  scheduled_for    date,
  agent_id         uuid references users (id),
  objectives       text,                      -- checklist brief for the field team
  field_notes      text,
  started_at       timestamptz,
  submitted_at     timestamptz,
  reviewed_at      timestamptz,
  reviewed_by      uuid references users (id),
  created_by       uuid references users (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index inspections_project_idx on inspections (project_id, scheduled_for);
create index inspections_agent_idx on inspections (agent_id, status);

create table findings (
  id            uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections (id) on delete cascade,
  position      integer not null default 0,
  area          text not null,                 -- e.g. "Physical existence", "Site access"
  observation   text not null,                 -- what was seen, factually
  status        text not null check (status in ('ok', 'warn', 'bad', 'unverified')),
  confidence    text not null check (confidence in ('high', 'moderate', 'limited')),
  evidence_grade text check (evidence_grade in ('E1', 'E2', 'E3', 'E4', 'E5')),
  action        text,                          -- required action / recommendation
  created_by    uuid references users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index findings_inspection_idx on findings (inspection_id, position);

create sequence evidence_number_seq start 1;

-- Every uploaded file: evidence (photo/video/drone), client documents, report PDFs.
create table files (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid references projects (id) on delete cascade,
  request_id     uuid references requests (id) on delete cascade,
  inspection_id  uuid references inspections (id) on delete set null,
  category       text not null check (category in ('evidence', 'client_document', 'report', 'internal')),
  media_type     text not null check (media_type in ('photo', 'video', 'drone', 'document', 'other')),
  evidence_code  text unique,                  -- AV-E-000123, for evidence only
  filename       text not null,
  mime           text not null,
  size_bytes     bigint not null check (size_bytes >= 0),
  storage_key    text not null unique,
  status         text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  sha256         text,                         -- integrity: hash of the stored bytes
  caption        text,
  gps_lat        double precision,
  gps_lng        double precision,
  taken_at       timestamptz,                  -- from EXIF
  integrity_flag text,                         -- why this item needs manual QA (missing GPS, far from site…)
  visible_to_client boolean not null default false,
  uploaded_by    uuid not null references users (id),
  created_at     timestamptz not null default now(),
  check (project_id is not null or request_id is not null)
);
create index files_project_idx on files (project_id, created_at desc);
create index files_inspection_idx on files (inspection_id);

-- ---------------------------------------------------------------------------
-- Stage 7–8: reports (analyst drafts, a second person reviews, then published)
-- ---------------------------------------------------------------------------

create type report_status as enum ('draft', 'in_review', 'published', 'withdrawn');

create table reports (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references projects (id) on delete cascade,
  inspection_id      uuid references inspections (id) on delete set null,
  title              text not null,
  status             report_status not null default 'draft',
  executive_summary  text not null default '',
  overall_status     text check (overall_status in ('ok', 'warn', 'bad')),
  recommended_decision text,                    -- e.g. "Conditional proceed"
  recommendations    text,
  limitations        text not null default '',
  pdf_file_id        uuid references files (id) on delete set null,
  author_id          uuid references users (id),
  reviewer_id        uuid references users (id),
  submitted_at       timestamptz,
  published_at       timestamptz,
  client_rating      smallint check (client_rating between 1 and 5),
  client_feedback    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index reports_project_idx on reports (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Communication and history
-- ---------------------------------------------------------------------------

create table messages (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects (id) on delete cascade,
  request_id  uuid references requests (id) on delete cascade,
  author_id   uuid not null references users (id),
  body        text not null check (length(body) between 1 and 8000),
  internal    boolean not null default false,  -- staff-only note, never shown to the client
  created_at  timestamptz not null default now(),
  check (project_id is not null or request_id is not null)
);
create index messages_project_idx on messages (project_id, created_at);
create index messages_request_idx on messages (request_id, created_at);

-- When each user last read each thread (thread = 'p:<project id>' or 'r:<request id>').
create table message_reads (
  user_id     uuid not null references users (id) on delete cascade,
  thread      text not null,
  read_at     timestamptz not null default now(),
  primary key (user_id, thread)
);

-- Audit trail and client-facing timeline in one place.
create table events (
  id           bigint generated always as identity primary key,
  actor_id     uuid references users (id),
  request_id   uuid references requests (id) on delete cascade,
  project_id   uuid references projects (id) on delete cascade,
  type         text not null,                 -- e.g. request.submitted, proposal.accepted, report.published
  summary      text not null,                 -- human-readable line for the timeline
  client_visible boolean not null default false,
  data         jsonb not null default '{}',
  ip_hash      text,
  created_at   timestamptz not null default now()
);
create index events_project_idx on events (project_id, created_at desc);
create index events_request_idx on events (request_id, created_at desc);
create index events_created_idx on events (created_at desc);

-- In-app notifications (also sent by email when email is configured).
create table notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references users (id) on delete cascade,
  title       text not null,
  body        text,
  href        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------

create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger users_touch before update on users for each row execute function touch_updated_at();
create trigger requests_touch before update on requests for each row execute function touch_updated_at();
create trigger projects_touch before update on projects for each row execute function touch_updated_at();
create trigger inspections_touch before update on inspections for each row execute function touch_updated_at();
create trigger findings_touch before update on findings for each row execute function touch_updated_at();
create trigger reports_touch before update on reports for each row execute function touch_updated_at();

do $$
declare t text;
begin
  foreach t in array array['users','sessions','user_tokens','login_attempts','pricing_versions','enquiries','requests',
    'proposals','projects','project_contacts','inspections','findings','files','reports','messages','message_reads',
    'events','notifications']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
