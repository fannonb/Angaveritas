import 'server-only'
import { sql } from '@/lib/db'

export type InvoiceLine = { label: string; detail?: string; amount: number }
export type InvoiceDoc = {
  id: string
  code: string
  label: string
  status: 'issued' | 'cancelled'
  amountKes: number
  depositKes: number
  paidKes: number
  balanceKes: number
  depositDueKes: number
  issuedOn: Date
  dueOn: string | null
  sentAt: Date | null
  cancelledAt: Date | null
  cancelReason: string | null
  lines: InvoiceLine[]
  /** Where the invoice stands, in words a client understands. */
  state: 'cancelled' | 'paid' | 'deposit_paid' | 'part_paid' | 'due'
  payments: { kind: 'payment' | 'refund'; amountKes: number; reference: string; recordedAt: Date }[]
  paymentTerms: string | null
  project: { id: string; code: string; title: string; serviceName: string | null; location: string | null }
  client: { id: string; name: string; email: string; phone: string | null; basedIn: string | null }
}

/**
 * Everything needed to show or print one invoice. Lines come from the invoice (copied from the accepted proposal);
 * older or manual invoices fall back to a single line so the document always adds up.
 */
export async function invoiceDocument(invoiceId: string, projectId: string): Promise<InvoiceDoc | null> {
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) return null
  const [row] = await sql`
    select i.*, p.code project_code, p.title project_title, p.service_name, p.location_label, p.client_id,
      u.full_name client_name, u.email client_email, u.phone client_phone, u.based_in client_based_in,
      pr.payment_terms, pr.line_items proposal_lines
    from invoices i
    join projects p on p.id = i.project_id
    join users u on u.id = p.client_id
    left join proposals pr on pr.id = i.proposal_id
    where i.id = ${invoiceId} and i.project_id = ${projectId}`
  if (!row) return null
  const payments = await sql<{ kind: 'payment' | 'refund'; amount_kes: number; reference: string; created_at: Date }[]>`
    select kind, amount_kes, reference, created_at from payments where invoice_id = ${invoiceId} order by created_at`

  const stored = (Array.isArray(row.line_items) && row.line_items.length ? row.line_items : row.proposal_lines) as InvoiceLine[] | null
  const lines: InvoiceLine[] = stored?.length && stored.reduce((s, l) => s + Number(l.amount), 0) === row.amount_kes
    ? stored.map((l) => ({ label: String(l.label), detail: l.detail ? String(l.detail) : undefined, amount: Number(l.amount) }))
    : [{ label: row.label.replace(new RegExp(`^${row.code}\\s*·\\s*`), ''), amount: row.amount_kes }]

  const paidKes = payments.reduce((s, p) => s + (p.kind === 'payment' ? p.amount_kes : -p.amount_kes), 0)
  const balanceKes = Math.max(0, row.amount_kes - paidKes)
  const depositDueKes = Math.max(0, row.deposit_kes - paidKes)
  const state: InvoiceDoc['state'] = row.status === 'cancelled' ? 'cancelled'
    : balanceKes === 0 ? 'paid'
    : paidKes > 0 && depositDueKes === 0 && row.deposit_kes < row.amount_kes ? 'deposit_paid'
    : paidKes > 0 ? 'part_paid'
    : 'due'

  return {
    id: row.id,
    code: row.code,
    label: row.label.replace(new RegExp(`^${row.code}\\s*·\\s*`), ''),
    status: row.status,
    amountKes: row.amount_kes,
    depositKes: row.deposit_kes,
    paidKes,
    balanceKes,
    depositDueKes,
    issuedOn: row.created_at,
    dueOn: row.due_on ? new Date(row.due_on).toISOString().slice(0, 10) : null,
    sentAt: row.sent_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    lines,
    state,
    payments: payments.map((p) => ({ kind: p.kind, amountKes: p.amount_kes, reference: p.reference, recordedAt: p.created_at })),
    paymentTerms: row.payment_terms ?? null,
    project: { id: row.project_id, code: row.project_code, title: row.project_title, serviceName: row.service_name, location: row.location_label },
    client: { id: row.client_id, name: row.client_name, email: row.client_email, phone: row.client_phone, basedIn: row.client_based_in },
  }
}

export const invoiceStateLabels: Record<InvoiceDoc['state'], string> = {
  cancelled: 'Cancelled',
  paid: 'Paid in full',
  deposit_paid: 'Deposit received',
  part_paid: 'Part paid',
  due: 'Payment due',
}
