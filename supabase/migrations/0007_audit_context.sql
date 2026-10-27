-- Include invoice-ledger changes in the project's audit history. Insert
-- attribution falls back only to an explicit author/uploader, never an owner.
create or replace function audit_record_change() returns trigger language plpgsql as $$
declare before_data jsonb; after_data jsonb; actor uuid; pid uuid; rid uuid; record_data jsonb;
begin
  if tg_op <> 'INSERT' then before_data := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then after_data := to_jsonb(new); end if;
  if before_data is not distinct from after_data then return null; end if;
  record_data := coalesce(after_data,before_data);
  actor := nullif(current_setting('app.actor_id', true),'')::uuid;
  if actor is null and tg_op='INSERT' then actor := coalesce(nullif(record_data->>'created_by',''),nullif(record_data->>'uploaded_by',''),nullif(record_data->>'requested_by',''),nullif(record_data->>'recorded_by',''))::uuid; end if;
  if tg_table_name = 'projects' then pid := (record_data->>'id')::uuid;
  elsif tg_table_name = 'requests' then rid := (record_data->>'id')::uuid;
  elsif tg_table_name = 'findings' then select project_id into pid from inspections where id = (record_data->>'inspection_id')::uuid;
  elsif tg_table_name = 'payments' then select project_id into pid from invoices where id = (record_data->>'invoice_id')::uuid;
  else
    pid := nullif(record_data->>'project_id','')::uuid;
    rid := nullif(record_data->>'request_id','')::uuid;
  end if;
  insert into events(actor_id,project_id,request_id,type,summary,data,ip_hash)
  values(actor,pid,rid,tg_table_name || '.' || lower(tg_op),tg_table_name || ' ' || lower(tg_op),
    jsonb_build_object('before',before_data,'after',after_data), nullif(current_setting('app.ip_hash',true),''));
  return null;
end $$;

-- A closed lead cannot keep an actionable sent proposal.
create function close_request_proposals() returns trigger language plpgsql as $$
begin if new.status in ('closed','withdrawn') and old.status is distinct from new.status then update proposals set status='superseded' where request_id=new.id and status='sent'; end if; return null; end $$;
create trigger requests_close_proposals after update on requests for each row execute function close_request_proposals();
