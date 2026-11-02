-- Shared request counters for the public lookup endpoints (place search, road distance).
-- Counting in memory only limits one server instance; on Vercel each request may land on a
-- different one. Keys hold a hashed client IP, never the address itself.
create table rate_limits (
  key       text primary key,
  count     integer not null,
  reset_at  timestamptz not null
);
create index rate_limits_reset_idx on rate_limits (reset_at);
alter table rate_limits enable row level security;
