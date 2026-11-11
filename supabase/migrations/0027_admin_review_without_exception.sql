-- An active admin can review and release work they took part in: the admin's review is the check, so no separate exception note is needed.
-- Any other reviewer must still be independent of the work.
create or replace function review_exception_guard() returns trigger language plpgsql as $$
declare independent boolean; reviewer uuid;
begin
  if tg_table_name='reports' then
    if old.status<>new.status and new.status='published' then reviewer:=new.reviewer_id; independent:=report_reviewer_independent(new.id,reviewer); else return new; end if;
    if not exists(select 1 from users where id=reviewer and role='admin' and disabled_at is null) then raise exception 'Only an active admin can approve and publish a report.'; end if;
  else
    if old.status<>new.status and new.status='reviewed' then reviewer:=new.reviewed_by; independent:=inspection_reviewer_independent(new.id,reviewer); else return new; end if;
  end if;
  if not independent and not exists(select 1 from users where id=reviewer and role='admin' and disabled_at is null)
    then raise exception 'An independent person must review this work.'; end if;
  return new;
end $$;
