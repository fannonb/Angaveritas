-- Staff can clear a client message that needs no reply (e.g. "Thank you"). The thread leaves the reply queue
-- until the client writes again: a newer message than last_message_at brings it back.
create table reply_dismissals (
  thread          text primary key,              -- 'p:<project id>' or 'r:<request id>', as in the reply queue
  last_message_at timestamptz not null,
  dismissed_by    uuid not null references users(id),
  dismissed_at    timestamptz not null default now()
);
alter table reply_dismissals enable row level security;
