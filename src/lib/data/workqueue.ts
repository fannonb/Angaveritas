import 'server-only'
import { sql } from '@/lib/db'

export type WorkTask = { key: string; label: string; task: string; owner: string | null; due_on: string | null; waiting_on: string; href: string; assigned_to: string | null; review: boolean; priority: number }

/** Actionable work with an owner and a real destination. Personal view includes eligible independent QA. */
export async function staffWorkQueue(userId: string, team: boolean) {
  return sql<WorkTask[]>`select * from (
    select 'request:'||r.id as key,r.reference||' · '||r.title as label,
      case when r.status='submitted' then 'Review enquiry and prepare proposal' else 'Finish and send proposal' end as task,
      u.full_name as owner,null::text as due_on,'Analyst'::text as waiting_on,'/staff/requests/'||r.reference as href,
      r.owner_id as assigned_to,false as review,2 as priority
    from requests r left join users u on u.id=r.owner_id where r.status in ('submitted','in_review','declined')
    union all
    select 'prepare:'||p.id,p.code||' · '||p.title,
      case when p.onboarding_submitted_at is null or p.data_consent_at is null then 'Get site details and consent'
        when p.lead_analyst_id is null or p.field_agent_id is null then 'Assign the visit team'
        when p.payment_status='awaiting_payment' then 'Confirm deposit or follow up payment'
        when p.nda_status='requested' then 'Prepare requested confidentiality agreement'
        when p.nda_status='prepared' then 'Follow up NDA signature' else 'Schedule the site visit' end,
      u.full_name,p.due_date::text,
      case when p.onboarding_submitted_at is null or p.data_consent_at is null or p.nda_status='prepared' then 'Client' else 'Analyst' end,
      '/staff/projects/'||p.code||'?tab='||case when p.nda_status in ('requested','prepared') then 'agreement' when p.payment_status='awaiting_payment' then 'operations' else 'overview' end,
      p.lead_analyst_id,false,3
    from projects p left join users u on u.id=p.lead_analyst_id
    where p.stage in ('onboarding','planning') and not exists(select 1 from inspections i where i.project_id=p.id and i.status<>'cancelled')
    union all
    select 'visit:'||i.id,p.code||' · '||i.title,
      case when i.status='submitted' then 'Review visit findings and evidence' when i.scheduled_for<current_date then 'Reschedule or complete overdue visit' else 'Complete site visit' end,
      u.full_name,i.scheduled_for::text,case when i.status='submitted' then 'Independent reviewer' else 'Field agent' end,
      '/staff/inspections/'||i.id,case when i.status='submitted' then null::uuid else p.lead_analyst_id end,i.status='submitted',
      case when i.status='submitted' or i.scheduled_for<current_date then 1 else 3 end
    from inspections i join projects p on p.id=i.project_id left join users u on u.id=i.agent_id
    where i.status in ('scheduled','in_progress','submitted') and p.stage<>'closed'
      and (i.status<>'submitted' or (i.agent_id<>${userId} and not exists(select 1 from files f where f.inspection_id=i.id and f.uploaded_by=${userId})
        and not exists(select 1 from events e where e.actor_id=${userId} and (
          (e.type in ('findings.insert','findings.update','findings.delete') and coalesce(e.data->'after'->>'inspection_id',e.data->'before'->>'inspection_id')=i.id::text)
          or (e.type in ('inspection_checks.insert','inspection_checks.update','inspection_checks.delete')
            and coalesce(e.data->'after'->>'inspection_id',e.data->'before'->>'inspection_id')=i.id::text
            and (e.data->'before'->'outcome',e.data->'before'->'note',e.data->'before'->'evidence_ids') is distinct from
                (e.data->'after'->'outcome',e.data->'after'->'note',e.data->'after'->'evidence_ids')
            and coalesce(e.data->'after'->>'outcome',e.data->'before'->>'outcome','pending')<>'pending')
          or (e.type='inspections.update' and e.data->'after'->>'id'=i.id::text and e.data->'before'->'field_notes' is distinct from e.data->'after'->'field_notes')))))
    union all
    select 'report:'||r.id,p.code||' · '||r.title,
      case when r.status='in_review' then 'Review and publish report' else 'Finish draft report' end,
      u.full_name,p.due_date::text,case when r.status='in_review' then 'Independent reviewer' else 'Report author' end,
      '/staff/projects/'||p.code||'/reports/'||r.id,r.author_id,r.status='in_review',1
    from reports r join projects p on p.id=r.project_id left join users u on u.id=r.author_id
    where r.status in ('draft','in_review') and (r.status='draft' or (r.author_id<>${userId} and not exists(
      select 1 from events e where e.actor_id=${userId} and e.type='reports.update' and e.data->'after'->>'id'=r.id::text
        and ((e.data->'before')-array['status','submitted_at','published_at','reviewer_id','snapshot','updated_at']) is distinct from
            ((e.data->'after')-array['status','submitted_at','published_at','reviewer_id','snapshot','updated_at']))))
    union all
    select 'payment:'||n.id,p.code||' · '||p.title,'Reconcile payment reference '||n.reference,u.full_name,null::text,'Payment team',
      '/staff/projects/'||p.code||'?tab=operations',p.lead_analyst_id,false,1
    from payment_notices n join projects p on p.id=n.project_id left join users u on u.id=p.lead_analyst_id where n.status='pending'
    union all
    select 'collect:'||p.id,p.code||' · '||p.title,'Collect KES '||b.unpaid_kes::text||' still owed',u.full_name,b.oldest_due::text,'Client',
      '/staff/projects/'||p.code||'?tab=operations',p.lead_analyst_id,false,2
    from projects p
    left join users u on u.id=p.lead_analyst_id
    cross join lateral (
      select coalesce(sum(x.amount),0) as unpaid_kes, min(x.due_on) as oldest_due from (
        select i.amount_kes - coalesce((select sum(case when kind='payment' then amount_kes else -amount_kes end)::int from payments pay where pay.invoice_id=i.id),0) as amount,
          coalesce(i.due_on, i.created_at::date + 14) as due_on
        from invoices i where i.project_id=p.id and i.status='issued'
      ) x where x.amount > 0
    ) b
    where p.stage in ('analysis','delivered','monitoring') and p.payment_status in ('deposit_received','paid') and b.unpaid_kes > 0
    union all
    select 'service:'||s.id,p.code||' · '||p.title,'Respond to '||replace(s.kind,'_',' '),u.full_name,null::text,'Analyst',
      '/staff/projects/'||p.code||'?tab=settings',p.lead_analyst_id,false,1
    from service_requests s join projects p on p.id=s.project_id left join users u on u.id=p.lead_analyst_id where s.status='requested'
    union all
    select 'write:'||p.id,p.code||' · '||p.title,'Write report from reviewed findings',u.full_name,p.due_date::text,'Analyst',
      '/staff/projects/'||p.code||'?tab=reports',p.lead_analyst_id,false,2
    from projects p left join users u on u.id=p.lead_analyst_id where p.stage<>'closed'
      and exists(select 1 from inspections i where i.project_id=p.id and i.status='reviewed')
      and not exists(select 1 from inspections i where i.project_id=p.id and i.status in ('scheduled','in_progress','submitted'))
      and not exists(select 1 from reports r where r.project_id=p.id and r.status in ('draft','in_review','published'))
  ) q where ${team ? sql`true` : sql`(assigned_to=${userId} or review)`}
  order by priority, due_on nulls last,label limit 100`
}
