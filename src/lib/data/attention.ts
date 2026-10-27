import 'server-only'
import { sql } from '@/lib/db'
import { staffStats } from './dashboard'
import type { threadsAwaitingReply } from './messages'

export type AttentionItem = {
  key: string
  label: string
  count: number
  oldestDays: number | null
  hint: string
  href: string
  icon: string
  urgent: boolean
}

type Threads = { last_at: Date }[]

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
const daysSince = (d: Date | null) => (d ? Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000)) : null)
const daysSinceDue = (d: string | null) => (d ? Math.max(0, Math.floor((Date.now() - Date.parse(`${d}T00:00:00+03:00`)) / 86400000)) : null)

/**
 * What needs an admin's attention now, most urgent first. The home page and the sidebar badge both read
 * this, so the number in the menu always matches the list on the page.
 */
export async function adminAttention(threads: Threads) {
  const [rows, stats] = await Promise.all([
    sql<{
      reports: number; reports_since: Date | null
      visits: number; visits_since: Date | null
      payments: number; payments_since: Date | null
      overdue: number; overdue_since: string | null; overdue_kes: number
      enquiries_since: Date | null
      paid_month_kes: number
    }[]>`
      with overdue as (
        select i.due_on, i.amount_kes - coalesce((select sum(case when kind = 'payment' then amount_kes else -amount_kes end)::int from payments where invoice_id = i.id), 0) as unpaid
        from invoices i join projects p on p.id = i.project_id
        where i.status = 'issued' and p.payment_status <> 'waived' and i.due_on < current_date
      )
      select
        (select count(*)::int from reports where status = 'in_review') as reports,
        (select min(submitted_at) from reports where status = 'in_review') as reports_since,
        (select count(*)::int from inspections where status = 'submitted') as visits,
        (select min(submitted_at) from inspections where status = 'submitted') as visits_since,
        (select count(*)::int from payment_notices where status = 'pending') as payments,
        (select min(created_at) from payment_notices where status = 'pending') as payments_since,
        (select count(*)::int from overdue where unpaid > 0) as overdue,
        (select min(due_on)::text from overdue where unpaid > 0) as overdue_since,
        (select coalesce(sum(unpaid), 0)::int from overdue where unpaid > 0) as overdue_kes,
        (select min(created_at) from requests where status = 'submitted') as enquiries_since,
        (select coalesce(sum(case when kind = 'payment' then amount_kes else -amount_kes end), 0)::int from payments where created_at >= date_trunc('month', now())) as paid_month_kes`,
    staffStats(),
  ])
  const row = rows[0]
  const threadsSince = threads.length ? new Date(Math.min(...threads.map((t) => new Date(t.last_at).getTime()))) : null

  const items: AttentionItem[] = [
    { key: 'reports', label: plural(row.reports, 'report to approve', 'reports to approve'), count: row.reports, oldestDays: daysSince(row.reports_since), hint: 'Approve and publish, or return to draft', href: '/staff/reviews', icon: 'review', urgent: true },
    { key: 'replies', label: plural(threads.length, 'client reply waiting', 'client replies waiting'), count: threads.length, oldestDays: daysSince(threadsSince), hint: 'Answer in the project or request thread', href: '/staff/messages', icon: 'message', urgent: true },
    { key: 'visits', label: plural(row.visits, 'visit to review', 'visits to review'), count: row.visits, oldestDays: daysSince(row.visits_since), hint: 'Check the evidence, then release it to the client', href: '/staff/reviews', icon: 'pin', urgent: true },
    { key: 'payments', label: plural(row.payments, 'payment to confirm', 'payments to confirm'), count: row.payments, oldestDays: daysSince(row.payments_since), hint: "Check the funds, then confirm on the project's Billing tab", href: '/staff/projects?need=unpaid', icon: 'wallet', urgent: true },
    { key: 'overdue', label: plural(row.overdue, 'balance overdue', 'balances overdue'), count: row.overdue, oldestDays: daysSinceDue(row.overdue_since), hint: 'Past the due date and still unpaid', href: '/staff/projects?need=balance', icon: 'wallet', urgent: true },
    { key: 'enquiries', label: plural(stats.new_requests, 'new enquiry', 'new enquiries'), count: stats.new_requests, oldestDays: daysSince(row.enquiries_since), hint: 'Qualify the request and send a proposal', href: '/staff/requests', icon: 'inbox', urgent: false },
    { key: 'unassigned', label: plural(stats.unassigned, 'project without a team', 'projects without a team'), count: stats.unassigned, oldestDays: null, hint: 'Assign a lead analyst and field agent', href: '/staff/projects?need=unassigned', icon: 'users', urgent: false },
  ].filter((i) => i.count > 0)

  return {
    items,
    total: items.reduce((sum, i) => sum + i.count, 0),
    overdueKes: row.overdue_kes,
    paidMonthKes: row.paid_month_kes,
  }
}
