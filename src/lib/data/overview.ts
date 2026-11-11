import 'server-only'
import { sql } from '@/lib/db'
import { TECHNICAL_EVENT_PATTERN } from '@/lib/workflow'
import { threadsAwaitingReply } from './messages'
import { staffWorkQueue, type WorkTask } from './workqueue'

// The admin's business overview reads: what needs doing, what is coming up, how the business is doing, what happened.

export type Todo = WorkTask & { since: Date | null; closed: boolean; note?: string }

const due = (t: Todo) => t.due_on ?? (t.since ? t.since.toISOString().slice(0, 10) : '9999')

/**
 * One to-do list: actionable work from the queue plus client replies, each listed once. Replies on closed
 * projects go last. The sidebar badge counts `count`, so the menu always matches the page.
 */
export async function adminTodo(userId: string) {
  const [team, mine, threads] = await Promise.all([staffWorkQueue(userId, true), staffWorkQueue(userId, false), threadsAwaitingReply()])
  const work = (t: WorkTask): Todo => ({ ...t, since: null, closed: false })
  const replies: Todo[] = threads.map((t) => ({
    key: `reply:${t.thread}`, label: t.label, task: `Reply to ${t.client_name}`, owner: null, due_on: null, waiting_on: 'Team', href: t.href,
    assigned_to: null, review: false, priority: t.project_stage === 'closed' ? 9 : 1, since: new Date(t.last_at), closed: t.project_stage === 'closed', note: t.body,
  }))
  const all = [...team.filter((t) => t.waiting_on !== 'Client').map(work), ...replies].sort((a, b) => a.priority - b.priority || due(a).localeCompare(due(b)) || a.label.localeCompare(b.label))
  const mineKeys = new Set(mine.map((t) => t.key))
  return {
    all,
    mine: all.filter((t) => mineKeys.has(t.key) || t.key.startsWith('reply:')),
    client: team.filter((t) => t.waiting_on === 'Client').map(work),
    count: all.filter((t) => !t.closed).length,
  }
}

export type UpcomingItem = { kind: 'visit' | 'report' | 'invoice'; on_date: string | null; title: string; meta: string; href: string; arrival: string | null; status: string | null }

/** Visits, report due dates and invoice due dates in the next `days` days, plus visits still without a date or overdue. */
export async function adminUpcoming(days = 14) {
  return sql<UpcomingItem[]>`
    select * from (
      select 'visit' as kind, i.scheduled_for::text as on_date, p.code || ' · ' || i.title as title,
        coalesce(a.full_name, 'No agent assigned') as meta, '/staff/inspections/' || i.id as href, i.arrival_window as arrival, i.status::text as status
      from inspections i join projects p on p.id = i.project_id left join users a on a.id = i.agent_id
      where i.status in ('scheduled', 'in_progress') and (i.scheduled_for is null or i.scheduled_for <= current_date + ${days}::int)
      union all
      select 'report', p.due_date::text, p.code || ' · Report due', p.title, '/staff/projects/' || p.code || '?tab=reports', null, null
      from projects p
      where p.stage in ('planning', 'fieldwork', 'analysis') and p.due_date is not null and p.due_date <= current_date + ${days}::int
        and not exists (select 1 from reports r where r.project_id = p.id and r.work_order_id=p.active_work_order_id and r.status = 'published')
      union all
      select 'invoice', invoice_due_on(i.id)::text, i.code || ' due · KES ' || to_char(x.unpaid, 'FM999,999,999'), p.code || ' · ' || p.title, '/staff/projects/' || p.code || '?tab=operations', null, null
      from invoices i join projects p on p.id = i.project_id
      cross join lateral (select i.amount_kes - coalesce((select sum(case when kind = 'payment' then amount_kes else -amount_kes end)::int from payments where invoice_id = i.id), 0) as unpaid) x
      where i.status = 'issued' and p.payment_status <> 'waived' and x.unpaid > 0 and invoice_due_on(i.id) between current_date and current_date + ${days}::int
    ) u
    order by on_date nulls first, kind
    limit 12`
}

/** Money in KES: what is owed, what is overdue and what came in this month. */
export async function adminMoney() {
  const [row] = await sql<{ deposits_kes: number; deposits_n: number; balance_kes: number; balance_n: number; overdue_kes: number; paid_month_kes: number; closed_month: number }[]>`
    with open as (
      select i.amount_kes, i.deposit_kes, invoice_due_on(i.id) as due_on, p.payment_status,
        coalesce((select sum(case when kind = 'payment' then amount_kes else -amount_kes end)::int from payments where invoice_id = i.id), 0) as paid
      from invoices i join projects p on p.id = i.project_id
      where i.status = 'issued' and p.payment_status <> 'waived'
    )
    select
      coalesce(sum(greatest(deposit_kes - paid, 0)) filter (where payment_status = 'awaiting_payment'), 0)::int as deposits_kes,
      (count(*) filter (where payment_status = 'awaiting_payment' and deposit_kes > paid))::int as deposits_n,
      coalesce(sum(amount_kes - paid) filter (where payment_status <> 'awaiting_payment' and amount_kes > paid), 0)::int as balance_kes,
      (count(*) filter (where payment_status <> 'awaiting_payment' and amount_kes > paid))::int as balance_n,
      coalesce(sum(amount_kes - paid) filter (where amount_kes > paid and due_on < current_date), 0)::int as overdue_kes,
      (select coalesce(sum(case when kind = 'payment' then amount_kes else -amount_kes end), 0)::int from payments where created_at >= date_trunc('month', now())) as paid_month_kes,
      (select count(*)::int from projects where closed_at >= date_trunc('month', now())) as closed_month
    from open`
  return row
}

/** What happened across the business, from the audit trail. Row-level change records are left out. */
export async function recentActivity(limit = 12) {
  return sql<{ id: string; summary: string; created_at: Date; actor_name: string | null; ref: string | null; href: string | null }[]>`
    select e.id::text, e.summary, e.created_at, u.full_name as actor_name, coalesce(p.code, r.reference) as ref,
      case when p.code is not null then '/staff/projects/' || p.code when r.reference is not null then '/staff/requests/' || r.reference end as href
    from events e
    left join users u on u.id = e.actor_id
    left join projects p on p.id = e.project_id
    left join requests r on r.id = e.request_id
    where e.type !~ ${TECHNICAL_EVENT_PATTERN}
    order by e.created_at desc
    limit ${limit}`
}
