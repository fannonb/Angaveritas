alter type token_purpose add value 'staff_mfa_setup';

alter table sessions add column mfa_verified_at timestamptz;
create table staff_mfa (
  user_id uuid primary key references users(id) on delete cascade,
  encrypted_secret text not null,
  last_step bigint not null,
  enrolled_at timestamptz not null default now()
);
alter table staff_mfa enable row level security;

-- Staff must sign in with an authenticator. Legacy unverified clients must
-- establish their own password using a fresh mailbox link.
delete from sessions s using users u where s.user_id=u.id and (u.role<>'client' or u.email_verified_at is null);
update users set password_hash=null where role='client' and email_verified_at is null and password_hash is not null;

alter table email_outbox add column action_path text;
delete from email_outbox where subject in (
  'Reset your AngaVeritas password', 'Confirm your email for AngaVeritas', 'Your AngaVeritas staff account'
);
delete from user_tokens where used_at is null and purpose in ('verify_email','reset_password','invite');

alter table files add column scanned_at timestamptz;
create index files_uploader_quota on files(uploaded_by,created_at);
