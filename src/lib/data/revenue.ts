import 'server-only'
import { sql } from '@/lib/db'

// Revenue is read from the ledger: recorded payments and issued invoices. A cancelled invoice is not revenue,
// a refund reduces what was collected, and a client's payment claim only counts once staff have confirmed it.

export async function revenueSummary() {
  const [totals] = await sql<{
    invoiced: number; collected: number; collected_month: number; collected_year: number
    outstanding: number; overdue: number; waived: number; overdue_count: number; outstanding_count: number
    claims: number; claims_kes: number
  }[]>`
    with inv as (
      select i.id, i.project_id, i.amount_kes, i.due_on,
        i.amount_kes - coalesce((select sum(case when pay.kind = 'payment' then pay.amount_kes else -pay.amount_kes end)::int from payments pay where pay.invoice_id = i.id), 0) as unpaid
      from invoices i
      where i.status = 'issued'
    )
    select
      (select coalesce(sum(amount_kes), 0)::int from inv) as invoiced,
      (select coalesce(sum(case when kind = 'payment' then amount_kes else -amount_kes end), 0)::int from payments) as collected,
      (select coalesce(sum(case when kind = 'payment' then amount_kes else -amount_kes end), 0)::int from payments where created_at >= date_trunc('month', now())) as collected_month,
      (select coalesce(sum(case when kind = 'payment' then amount_kes else -amount_kes end), 0)::int from payments where created_at >= date_trunc('year', now())) as collected_year,
      (select coalesce(sum(inv.unpaid), 0)::int from inv join projects p on p.id = inv.project_id where inv.unpaid > 0 and p.payment_status <> 'waived') as outstanding,
      (select count(*)::int from inv join projects p on p.id = inv.project_id where inv.unpaid > 0 and p.payment_status <> 'waived') as outstanding_count,
      (select coalesce(sum(inv.unpaid), 0)::int from inv join projects p on p.id = inv.project_id where inv.unpaid > 0 and p.payment_status <> 'waived' and inv.due_on < current_date) as overdue,
      (select count(*)::int from inv join projects p on p.id = inv.project_id where inv.unpaid > 0 and p.payment_status <> 'waived' and inv.due_on < current_date) as overdue_count,
      (select coalesce(sum(inv.unpaid), 0)::int from inv join projects p on p.id = inv.project_id where inv.unpaid > 0 and p.payment_status = 'waived') as waived,
      (select count(*)::int from payment_notices where status = 'pending') as claims,
      (select coalesce(sum(amount_kes), 0)::int from payment_notices where status = 'pending') as claims_kes`

  const months = await sql<{ month: string; collected: number; invoiced: number }[]>`
    with months as (
      select to_char(m, 'YYYY-MM') as month
      from generate_series(date_trunc('month', now() at time zone 'Africa/Nairobi') - interval '11 months', date_trunc('month', now() at time zone 'Africa/Nairobi'), interval '1 month') m
    )
    select months.month,
      coalesce((select sum(case when kind = 'payment' then amount_kes else -amount_kes end) from payments
        where to_char(date_trunc('month', created_at at time zone 'Africa/Nairobi'), 'YYYY-MM') = months.month), 0)::int as collected,
      coalesce((select sum(amount_kes) from invoices
        where status = 'issued' and to_char(date_trunc('month', created_at at time zone 'Africa/Nairobi'), 'YYYY-MM') = months.month), 0)::int as invoiced
    from months order by months.month`

  // Every invoice with money still owed, most overdue first.
  const pending = await sql<{
    id: string; code: string; label: string; due_on: string | null; sent_at: Date | null; amount_kes: number; paid_kes: number; unpaid_kes: number
    project_id: string; project_code: string; project_title: string; client_name: string; payment_status: string
  }[]>`
    select i.id, i.code, i.label, i.due_on::text as due_on, i.sent_at, i.amount_kes,
      coalesce((select sum(case when kind = 'payment' then amount_kes else -amount_kes end) from payments where invoice_id = i.id), 0)::int as paid_kes,
      (i.amount_kes - coalesce((select sum(case when kind = 'payment' then amount_kes else -amount_kes end) from payments where invoice_id = i.id), 0))::int as unpaid_kes,
      p.id as project_id, p.code as project_code, p.title as project_title, u.full_name as client_name, p.payment_status
    from invoices i
    join projects p on p.id = i.project_id
    join users u on u.id = p.client_id
    where i.status = 'issued' and p.payment_status <> 'waived'
      and i.amount_kes > coalesce((select sum(case when kind = 'payment' then amount_kes else -amount_kes end) from payments where invoice_id = i.id), 0)
    order by i.due_on nulls last, i.code
    limit 200`

  const claims = await sql<{ id: string; reference: string; amount_kes: number; created_at: Date; invoice_code: string; project_code: string; project_title: string }[]>`
    select n.id, n.reference, n.amount_kes, n.created_at, i.code as invoice_code, p.code as project_code, p.title as project_title
    from payment_notices n
    join invoices i on i.id = n.invoice_id
    join projects p on p.id = n.project_id
    where n.status = 'pending'
    order by n.created_at
    limit 50`

  const byProject = await sql<{ project_code: string; project_title: string; invoiced: number; collected: number; outstanding: number }[]>`
    select p.code as project_code, p.title as project_title,
      sum(i.amount_kes)::int as invoiced,
      coalesce(sum(coalesce((select sum(case when kind = 'payment' then amount_kes else -amount_kes end) from payments where invoice_id = i.id), 0)), 0)::int as collected,
      coalesce(sum(i.amount_kes - coalesce((select sum(case when kind = 'payment' then amount_kes else -amount_kes end) from payments where invoice_id = i.id), 0)), 0)::int as outstanding
    from invoices i join projects p on p.id = i.project_id
    where i.status = 'issued'
    group by p.id, p.code, p.title
    order by outstanding desc, invoiced desc
    limit 100`

  return { totals, months, pending, claims, byProject }
}
