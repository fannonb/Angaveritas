import Link from 'next/link'
import { invoicePaystackAttempts } from '@/lib/data/paystack'
import { sql } from '@/lib/db'
import { paystackConfig, paystackEnabled } from '@/lib/paystack'
import PaystackCheckout from './PaystackCheckout'
import { kes,fmtDateTime } from './format'

// A checkout counts as open for 30 minutes, the same window in which starting checkout again reuses it.
// After that the client can pay again; the worker still reconciles the old one if it was completed.
const OPEN_MS = 30 * 60 * 1000

export default async function PaystackInvoiceActions({ invoiceId,balance,depositDue,manager=false,waived=false }: {
  invoiceId: string; balance: number; depositDue: number; manager?: boolean; waived?: boolean
}) {
  const [attempts, notices] = await Promise.all([
    invoicePaystackAttempts(invoiceId),
    sql`select 1 from payment_notices where invoice_id=${invoiceId} and status='pending' limit 1`,
  ])
  const needsReview = attempts.some(a => a.status === 'review' && !a.reviewed_at)
  const recent = attempts.find(a => ['initializing','pending'].includes(a.status) && Date.now() - new Date(a.created_at).getTime() < OPEN_MS)
  const labels: Record<string,string> = { initializing:'Preparing checkout',pending:'Awaiting payment confirmation',success:'Payment confirmed',failed:'Payment failed',abandoned:'Checkout not completed',review:'Team review required' }

  if (!manager) {
    if (waived || balance <= 0) return null
    if (needsReview) return <p className="alert alert-info no-print">Your analyst is confirming an earlier payment. You can pay again once it is sorted.</p>
    if (notices.length) return <p className="alert alert-info no-print">We are checking the payment reference you sent. No need to pay again.</p>
    if (!paystackEnabled()) return null
    // The newest attempt decides the message: one in progress can be continued; one that ended unpaid invites another try.
    const latest = attempts.filter(a => a.status !== 'review').sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0]
    const ended = latest && ['failed', 'abandoned'].includes(latest.status)
    return <div className="no-print space-y-2">
      {recent && <p className="text-sm text-ink-2">You opened a payment at {fmtDateTime(recent.created_at)}. Continue it below, or <Link href={`/portal/payments/return?reference=${encodeURIComponent(recent.reference)}`}>check whether it went through</Link>.</p>}
      {!recent && ended && <p className="alert alert-warn">Your last payment ({fmtDateTime(latest.created_at)}) did not go through, so nothing was recorded. Please try again.</p>}
      <PaystackCheckout invoiceId={invoiceId} balance={balance} depositDue={depositDue} resume={!!recent} testMode={paystackConfig()!.environment === 'test'} />
    </div>
  }

  if (!attempts.length) return null
  return <details className="no-print text-sm">
    <summary className="cursor-pointer text-muted">Paystack checkouts ({attempts.length})</summary>
    <div className="mt-2 space-y-2">
      {attempts.map(a => <div key={a.reference} className="text-ink-2">
        <p>{a.reviewed_at ? 'Reviewed by the team' : labels[a.status] ?? 'Being checked'} · {kes(Number(a.amount_minor)/100)}{a.channel ? ` · ${a.channel}` : ''} · {fmtDateTime(a.created_at)}</p>
        <p className="text-xs break-all text-muted">Reference: {a.reference}</p>
        {a.last_error && <p className="hint">{a.last_error}</p>}
        {a.status==='review' && !a.reviewed_at && <Link href="/staff/integrations">Review payment exception</Link>}
      </div>)}
    </div>
  </details>
}
