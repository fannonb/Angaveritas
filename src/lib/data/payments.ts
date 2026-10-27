import 'server-only'
import { sql } from '@/lib/db'

export const historyPageSize = 10

// What a client sees of their own invoices and payments. Only their projects are read, and the internal reconciliation
// note on each payment is never selected.
export type InvoiceStatus = 'paid' | 'part' | 'due' | 'overdue' | 'checking' | 'waived'

export async function clientPayments(clientId: string, historyPage = 1) {
  const rows = await sql<{
    id: string; code: string; label: string; amount_kes: number; paid_kes: number; owed_kes: number
    due_on: string | null; sent_at: Date | null; created_at: Date
    project_code: string; project_title: string; payment_status: string; checking: boolean
  }[]>`
    select i.id, i.code, i.label, i.amount_kes, i.due_on::text as due_on, i.sent_at, i.created_at,
      coalesce((select sum(case when pay.kind = 'payment' then pay.amount_kes else -pay.amount_kes end) from payments pay where pay.invoice_id = i.id), 0)::int as paid_kes,
      (i.amount_kes - coalesce((select sum(case when pay.kind = 'payment' then pay.amount_kes else -pay.amount_kes end) from payments pay where pay.invoice_id = i.id), 0))::int as owed_kes,
      p.code as project_code, p.title as project_title, p.payment_status,
      exists(select 1 from payment_notices n where n.invoice_id = i.id and n.status = 'pending') as checking
    from invoices i join projects p on p.id = i.project_id
    where p.client_id = ${clientId} and i.status = 'issued'
    order by i.created_at desc`

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' })
  const invoices = rows.map((r) => {
    let status: InvoiceStatus
    if (r.payment_status === 'waived') status = 'waived'
    else if (r.owed_kes <= 0) status = 'paid'
    else if (r.checking) status = 'checking'
    else if (r.due_on && r.due_on < today) status = 'overdue'
    else if (r.paid_kes > 0) status = 'part'
    else status = 'due'
    return { ...r, status }
  })

  const claims = await sql<{ id: string; reference: string; amount_kes: number; created_at: Date; invoice_code: string; project_code: string; project_title: string }[]>`
    select n.id, n.reference, n.amount_kes, n.created_at, i.code as invoice_code, p.code as project_code, p.title as project_title
    from payment_notices n
    join invoices i on i.id = n.invoice_id
    join projects p on p.id = n.project_id
    where p.client_id = ${clientId} and n.status = 'pending'
    order by n.created_at desc`

  const [count] = await sql<{ n: number }[]>`
    select count(*)::int as n from payments pay
    join invoices i on i.id = pay.invoice_id
    join projects p on p.id = i.project_id
    where p.client_id = ${clientId}`
  const pages = Math.max(1, Math.ceil(count.n / historyPageSize))
  const current = Math.min(Math.max(1, historyPage), pages)
  const history = await sql<{ id: string; amount_kes: number; kind: string; reference: string; created_at: Date; invoice_code: string; project_code: string; project_title: string }[]>`
    select pay.id, pay.amount_kes, pay.kind, pay.reference, pay.created_at, i.code as invoice_code, p.code as project_code, p.title as project_title
    from payments pay
    join invoices i on i.id = pay.invoice_id
    join projects p on p.id = i.project_id
    where p.client_id = ${clientId}
    order by pay.created_at desc
    limit ${historyPageSize} offset ${(current - 1) * historyPageSize}`

  // Waived projects owe nothing, so their invoices are left out of what is still to pay.
  const owing = invoices.filter((i) => i.status !== 'waived' && i.owed_kes > 0)
  const overdue = owing.filter((i) => i.status === 'overdue')
  const nextDue = owing.filter((i) => i.due_on).sort((a, b) => (a.due_on! < b.due_on! ? -1 : 1))[0]
  const totals = {
    invoiced: invoices.reduce((sum, i) => sum + i.amount_kes, 0),
    paid: invoices.reduce((sum, i) => sum + i.paid_kes, 0),
    owed: owing.reduce((sum, i) => sum + i.owed_kes, 0),
    overdueKes: overdue.reduce((sum, i) => sum + i.owed_kes, 0),
    overdueCount: overdue.length,
    owingCount: owing.length,
    nextDue: nextDue ?? null,
    claimsKes: claims.reduce((sum, c) => sum + c.amount_kes, 0),
  }

  return {
    invoices,
    claims,
    totals,
    history: { items: history, total: count.n, page: current, pages },
  }
}
