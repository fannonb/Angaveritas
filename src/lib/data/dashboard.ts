import 'server-only'
import { sql } from '@/lib/db'
import type { Health } from '@/lib/labels'

export async function clientStats(clientId: string) {
  const [row] = await sql<{ active: number; on_track: number; assessed: number; alerts: number; inspections_month: number; next_visit: string | null; reports: number }[]>`
    select
      count(*) filter (where p.stage <> 'closed')::int as active,
      count(*) filter (where p.stage <> 'closed' and p.health = 'on_track')::int as on_track,
      count(*) filter (where p.stage <> 'closed' and p.health <> 'not_assessed')::int as assessed,
      (select count(*)::int from project_alerts a join projects pp on pp.id=a.project_id where pp.client_id=${clientId} and a.resolved_at is null and pp.stage <> 'closed') as alerts,
      (select count(*)::int from inspections i join projects pp on pp.id = i.project_id
        where pp.client_id = ${clientId} and i.status = 'reviewed' and i.reviewed_at > date_trunc('month', now())) as inspections_month,
      (select min(i.scheduled_for)::text from inspections i join projects pp on pp.id = i.project_id
        where pp.client_id = ${clientId} and i.status in ('scheduled', 'in_progress') and i.scheduled_for >= current_date) as next_visit,
      (select count(*)::int from reports r join projects pp on pp.id = r.project_id where pp.client_id = ${clientId} and r.status = 'published') as reports
    from projects p where p.client_id = ${clientId}`
  return row
}

/** Deposits the client still owes before a visit can be booked, one row per invoice. Waived projects are excluded. */
export async function clientDepositsDue(clientId: string) {
  return sql<{ project_code: string; project_title: string; invoice_code: string; due_kes: number; payment_notified: boolean }[]>`
    select x.*, coalesce((select sum(amount_kes) from payment_notices where invoice_id=x.invoice_id and status='pending'),0)>=due_kes as payment_notified from (
      select i.id invoice_id,p.code as project_code, p.title as project_title, i.code as invoice_code, i.created_at,
        i.deposit_kes - coalesce((select sum(case when kind = 'payment' then amount_kes else -amount_kes end)::int from payments where invoice_id = i.id), 0) as due_kes
      from invoices i join projects p on p.id = i.project_id
      where p.client_id = ${clientId} and i.status = 'issued' and p.stage <> 'closed' and p.payment_status = 'awaiting_payment'
    ) x where due_kes > 0 order by created_at`
}

/** A rating is optional; only actual view receipts clear the reading reminder. */
export async function clientReportsToRead(clientId: string) {
  return sql<{ id: string; project_code: string; project_title: string }[]>`
    select r.id, p.code as project_code, p.title as project_title
    from reports r join projects p on p.id = r.project_id
    where p.client_id = ${clientId} and r.status = 'published'
      and client_reports_unlocked(p.id)
      and not exists(select 1 from report_reads rr where rr.report_id=r.id and rr.user_id=${clientId})
    order by r.published_at desc limit 5`
}

/** One page of the client's visible activity, newest first. */
export async function clientActivity(clientId: string, page = 1, pageSize = 10) {
  const [count] = await sql<{ n: number }[]>`
    select count(*)::int as n from events e
    left join projects p on p.id = e.project_id
    left join requests r on r.id = e.request_id
    where e.client_visible and (p.client_id = ${clientId} or r.client_id = ${clientId})`
  const pages = Math.max(1, Math.ceil(count.n / pageSize))
  const current = Math.min(Math.max(1, page), pages)
  const items = await sql<{ id: number; summary: string; created_at: Date; actor_name: string | null; href: string | null }[]>`
    select e.id, e.summary, e.created_at, u.full_name as actor_name,
      coalesce('/portal/projects/' || p.code, '/portal/requests/' || r.reference) as href
    from events e
    left join users u on u.id = e.actor_id
    left join projects p on p.id = e.project_id
    left join requests r on r.id = e.request_id
    where e.client_visible and (p.client_id = ${clientId} or r.client_id = ${clientId})
    order by e.created_at desc
    limit ${pageSize} offset ${(current - 1) * pageSize}`
  return { items, total: count.n, page: current, pages }
}

export async function staffStats() {
  const [row] = await sql<{
    new_requests: number
    open_requests: number
    in_review: number
    proposals_out: number
    active_projects: number
    onboarding_waiting: number
    unassigned: number
    at_risk: number
    awaiting_payment: number
    balance_outstanding: number
    reports_in_review: number
    inspections_week: number
    flagged_evidence: number
    enquiries: number
  }[]>`
    select
      (select count(*)::int from requests where status = 'submitted') as new_requests,
      (select count(*)::int from requests where status in ('submitted', 'in_review', 'proposal_sent')) as open_requests,
      (select count(*)::int from requests where status = 'in_review') as in_review,
      (select count(*)::int from requests where status = 'proposal_sent') as proposals_out,
      (select count(*)::int from projects where stage <> 'closed') as active_projects,
      (select count(*)::int from projects where stage = 'onboarding') as onboarding_waiting,
      (select count(*)::int from projects where stage in ('onboarding', 'planning', 'fieldwork') and (field_agent_id is null or lead_analyst_id is null)) as unassigned,
      (select count(*)::int from projects where stage <> 'closed' and health in ('at_risk', 'high_risk')) as at_risk,
      (select count(*)::int from projects where stage <> 'closed' and payment_status = 'awaiting_payment') as awaiting_payment,
      (select count(*)::int from projects p where p.stage <> 'closed' and p.payment_status in ('deposit_received', 'paid')
        and exists(select 1 from invoices i where i.project_id = p.id and i.status = 'issued'
          and i.amount_kes > coalesce((select sum(case when kind = 'payment' then amount_kes else -amount_kes end)::int from payments pay where pay.invoice_id = i.id), 0))) as balance_outstanding,
      (select count(*)::int from reports where status = 'in_review') as reports_in_review,
      (select count(*)::int from inspections where status in ('scheduled', 'in_progress') and scheduled_for between current_date and current_date + 7) as inspections_week,
      (select count(*)::int from files where category = 'evidence' and integrity_flag is not null and status = 'ready' and not visible_to_client) as flagged_evidence,
      (select count(*)::int from enquiries where status = 'new') as enquiries`
  return row
}

/** Open projects by health, for the staff overview. */
export async function projectHealthCounts() {
  const rows = await sql<{ health: Health; n: number }[]>`select health, count(*)::int as n from projects where stage <> 'closed' group by health`
  return Object.fromEntries(rows.map((r) => [r.health, r.n])) as Partial<Record<Health, number>>
}

export async function upcomingInspections(agentId?: string) {
  return sql<{ id: string; code: string; title: string; status: string; scheduled_for: string | null; agent_name: string | null; project_code: string; project_title: string; location_label: string | null }[]>`
    select i.id, i.code, i.title, i.status, i.scheduled_for::text, a.full_name as agent_name, p.code as project_code, p.title as project_title, p.location_label
    from inspections i join projects p on p.id = i.project_id left join users a on a.id = i.agent_id
    where i.status in ('scheduled', 'in_progress') ${agentId ? sql`and i.agent_id = ${agentId}` : sql``}
    order by i.scheduled_for nulls last limit 20`
}
