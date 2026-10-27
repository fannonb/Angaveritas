alter table proposals add column deposit_kes integer check (deposit_kes >= 0 and deposit_kes <= total_kes);
create function commercial_request_guard() returns trigger language plpgsql as $$
begin
  if new.status='accepted' and not exists(select 1 from proposals where request_id=new.id and status='accepted') then raise exception 'Accept the proposal to accept a request.'; end if;
  if new.status='proposal_sent' and not exists(select 1 from proposals where request_id=new.id and status='sent') then raise exception 'Send a proposal first.'; end if;
  return new;
end $$;
create trigger requests_contract before update on requests for each row execute function commercial_request_guard();
create function protect_contract() returns trigger language plpgsql as $$
begin
  if old.status in ('sent','accepted','declined','superseded') and (to_jsonb(new) - array['status','responded_at','accepted_name','nda_requested','decline_reason','response_ip_hash']) is distinct from
    (to_jsonb(old) - array['status','responded_at','accepted_name','nda_requested','decline_reason','response_ip_hash']) then raise exception 'Sent proposal content cannot be changed. Create a new version.'; end if;
  return new;
end $$;
create trigger proposals_preserve before update on proposals for each row execute function protect_contract();

create function reviewer_role_guard() returns trigger language plpgsql as $$
declare reviewer uuid;
begin
  if tg_table_name='reports' and new.status::text='published' and old.status <> new.status then reviewer := new.reviewer_id;
  elsif tg_table_name='inspections' and new.status::text='reviewed' and old.status <> new.status then reviewer := new.reviewed_by;
  else return new; end if;
  if not exists(select 1 from users where id=reviewer and role in ('analyst','admin') and disabled_at is null) then raise exception 'An active analyst or admin must review.'; end if;
  return new;
end $$;
create trigger reports_reviewer_role before update on reports for each row execute function reviewer_role_guard();
create trigger inspections_reviewer_role before update on inspections for each row execute function reviewer_role_guard();
