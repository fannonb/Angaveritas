-- Run as the migration owner after db:migrate. Set the login password with
-- \password angaveritas_runtime in psql, outside this script.
begin;

do $$
declare
  tbl text;
begin
  if not exists (select 1 from pg_roles where rolname='angaveritas_runtime') then
    create role angaveritas_runtime login nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if exists (
    select 1 from pg_roles where rolname='angaveritas_runtime'
      and (rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)
  ) or has_schema_privilege('angaveritas_runtime', 'public', 'CREATE') then
    raise exception 'angaveritas_runtime must be an unprivileged role with no CREATE access in public.';
  end if;

  foreach tbl in array array[
    'users', 'sessions', 'user_tokens', 'login_attempts', 'staff_mfa',
    'pricing_versions', 'site_settings', 'enquiries', 'requests', 'proposals',
    'projects', 'project_sites', 'project_contacts', 'work_orders', 'workflow_cases',
    'inspections', 'inspection_checks', 'inspection_corrections', 'findings', 'files',
    'reports', 'report_evidence', 'report_reads', 'messages', 'message_reads',
    'events', 'notifications', 'reply_dismissals', 'invoices', 'payments',
    'payment_notices', 'payment_receipts', 'monitoring_cycles', 'service_requests',
    'project_alerts', 'email_outbox', 'gateway_events', 'paystack_attempts',
    'rate_limits', 'location_countries', 'location_regions'
  ] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=tbl and c.relrowsecurity
        and pg_get_userbyid(c.relowner)<>'angaveritas_runtime') then
      raise exception 'App table % must exist with RLS enabled and a separate owner.', tbl;
    end if;
    execute format('drop policy if exists app_runtime on public.%I', tbl);
    execute format('create policy app_runtime on public.%I to angaveritas_runtime using (true) with check (true)', tbl);
    execute format('revoke all on public.%I from angaveritas_runtime', tbl);
    execute format('grant select on public.%I to angaveritas_runtime', tbl);
    if tbl not in ('location_countries', 'location_regions') then
      execute format('grant insert on public.%I to angaveritas_runtime', tbl);
    end if;
    if tbl not in ('events', 'login_attempts', 'location_countries', 'location_regions') then
      execute format('grant update, delete on public.%I to angaveritas_runtime', tbl);
    end if;
  end loop;
end $$;

grant usage on schema public to angaveritas_runtime;
grant usage on sequence public.request_number_seq, public.project_number_seq,
  public.inspection_number_seq, public.evidence_number_seq, public.invoice_number_seq,
  public.login_attempts_id_seq, public.pricing_versions_id_seq, public.events_id_seq,
  public.notifications_id_seq to angaveritas_runtime;

commit;
