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
      case when p.lead_analyst_id is null or p.field_agent_id is null then 'Assign the work team'
        when p.nda_status='requested' then 'Prepare requested confidentiality agreement'
        when p.onboarding_submitted_at is null or p.data_consent_at is null then 'Waiting for service brief and consent'
        when w.hold_reason is not null then 'Review work hold: '||w.hold_reason when w.brief_approved_version is distinct from w.brief_version then 'Approve brief against scope' when p.payment_status='awaiting_payment' then 'Waiting for client deposit'
        when p.nda_status='prepared' then 'Waiting for NDA signature' else 'Schedule the site visit' end,
      u.full_name,p.due_date::text,
      case when p.lead_analyst_id is null or p.field_agent_id is null or p.nda_status='requested' or (p.onboarding_submitted_at is not null and (w.hold_reason is not null or w.brief_approved_version is distinct from w.brief_version)) then 'Analyst'
        when p.onboarding_submitted_at is null or p.data_consent_at is null or p.payment_status='awaiting_payment' or p.nda_status='prepared' then 'Client' else 'Analyst' end,
      '/staff/projects/'||p.code||'?tab='||case
        when p.lead_analyst_id is null or p.field_agent_id is null then 'overview#team'
        when p.nda_status='requested' then 'agreement'
        when p.onboarding_submitted_at is null or p.data_consent_at is null then 'site'
        when w.hold_reason is not null or w.brief_approved_version is distinct from w.brief_version then 'overview' when p.payment_status='awaiting_payment' then 'operations'
        when p.nda_status='prepared' then 'agreement' else 'inspections' end,
      p.lead_analyst_id,false,3
    from projects p join work_orders w on w.id=p.active_work_order_id left join users u on u.id=p.lead_analyst_id
    where p.stage in ('onboarding','planning') and not exists(select 1 from inspections i where i.project_id=p.id and i.work_order_id=p.active_work_order_id and i.status<>'cancelled')
    union all
    select 'visit:'||i.id,p.code||' · '||i.title,
      case when i.status='submitted' then 'Review visit findings and evidence' when i.scheduled_for<current_date then 'Reschedule or complete overdue visit' else 'Complete site visit' end,
      u.full_name,i.scheduled_for::text,case when i.status='submitted' then 'Independent reviewer' else 'Field agent' end,
      '/staff/inspections/'||i.id,case when i.status='submitted' then null::uuid else p.lead_analyst_id end,i.status='submitted',
      case when i.status='submitted' or i.scheduled_for<current_date then 1 else 3 end
    from inspections i join projects p on p.id=i.project_id left join users u on u.id=i.agent_id
    where i.status in ('scheduled','in_progress','submitted') and p.stage<>'closed'
      and (i.status<>'submitted' or ${team} or exists(select 1 from users where id=${userId} and role='admin') or inspection_reviewer_independent(i.id,${userId}))
    union all
    select 'report:'||r.id,p.code||' · '||r.title,
      case when r.status='in_review' then 'Review and publish report' else 'Finish draft report' end,
      u.full_name,p.due_date::text,case when r.status='in_review' then 'Admin' else 'Report author' end,
      '/staff/projects/'||p.code||'/reports/'||r.id,case when r.status='in_review' then null::uuid else r.author_id end,r.status='in_review',1
    from reports r join projects p on p.id=r.project_id left join users u on u.id=r.author_id
    where r.status in ('draft','in_review') and (r.status='draft' or ${team} or exists(select 1 from users where id=${userId} and role='admin'))
    union all
    select 'payment:'||n.id,p.code||' · '||p.title,'Reconcile payment reference '||n.reference,'Admin',null::text,'Admin',
      '/staff/projects/'||p.code||'?tab=operations',null::uuid,true,1
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
    where p.stage in ('analysis','delivered','monitoring') and p.payment_status in ('deposit_received','paid') and b.unpaid_kes > 0 and not exists(select 1 from payment_notices n where n.project_id=p.id and n.status='pending')
    union all
    select 'refund:'||i.id,p.code||' · '||i.code,'Arrange refund of KES '||(b.paid-i.amount_kes)::text,'Admin',null::text,'Admin',
      '/staff/projects/'||p.code||'?tab=operations#record-payment',null::uuid,true,1
    from invoices i join projects p on p.id=i.project_id left join users u on u.id=p.lead_analyst_id
    cross join lateral (select coalesce(sum(case when kind='payment' then amount_kes else -amount_kes end),0) paid from payments where invoice_id=i.id) b
    where i.status='issued' and b.paid>i.amount_kes
    union all
    select 'service:'||s.id,p.code||' · '||p.title,'Respond to '||replace(s.kind,'_',' '),u.full_name,null::text,'Analyst',
      '/staff/projects/'||p.code||'?tab=settings',p.lead_analyst_id,false,1
    from service_requests s join projects p on p.id=s.project_id left join users u on u.id=p.lead_analyst_id where s.status='requested' and s.kind<>'cancellation'
    union all
    select 'write:'||p.id,p.code||' · '||p.title,'Write report from reviewed findings',u.full_name,p.due_date::text,'Analyst',
      '/staff/projects/'||p.code||'?tab=reports',p.lead_analyst_id,false,2
    from projects p left join users u on u.id=p.lead_analyst_id where p.stage<>'closed'
      and exists(select 1 from inspections i where i.project_id=p.id and i.work_order_id=p.active_work_order_id and i.status='reviewed')
      and not exists(select 1 from inspections i where i.project_id=p.id and i.work_order_id=p.active_work_order_id and i.status in ('scheduled','in_progress','submitted'))
      and not exists(select 1 from reports r where r.project_id=p.id and r.work_order_id=p.active_work_order_id and r.status in ('draft','in_review','published'))
    union all
    select 'case:'||c.id,p.code||' · '||c.title,c.title,coalesce(u.full_name,'Team'),c.due_on::text,
      case when c.status='awaiting_client' then 'Client' when c.kind in ('cancellation','scope_change') then 'Admin' else 'Analyst' end,
      '/staff/projects/'||p.code||'?tab=settings',case when c.kind in ('cancellation','scope_change') then null::uuid else c.assigned_to end,true,1
    from workflow_cases c join projects p on p.id=c.project_id left join users u on u.id=c.assigned_to where c.status in ('open','awaiting_client','accepted')
    union all
    select 'cycle:'||c.id,p.code||' · Monitoring cycle','Paid cycle ready to schedule',u.full_name,c.cycle_on::text,'Analyst',
      '/staff/projects/'||p.code||'?tab=monitoring',p.lead_analyst_id,false,1
    from monitoring_cycles c join projects p on p.id=c.project_id join invoices inv on inv.id=c.invoice_id left join users u on u.id=p.lead_analyst_id
    where c.inspection_id is null and inv.status='issued' and p.monitoring_status='active'
      and inv.deposit_kes<=coalesce((select sum(case when kind='payment' then amount_kes else -amount_kes end) from payments where invoice_id=inv.id),0)
  ) q where ${team ? sql`true` : sql`((assigned_to=${userId} or review) and (waiting_on<>'Admin' or exists(select 1 from users where id=${userId} and role='admin')))`}
  order by (waiting_on='Client'), priority, due_on nulls last,label limit 100`
}
