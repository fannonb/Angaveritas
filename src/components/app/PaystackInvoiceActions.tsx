import Link from 'next/link'
import { invoicePaystackAttempts } from '@/lib/data/paystack'
import { paystackConfig, paystackEnabled } from '@/lib/paystack'
import PaystackCheckout from './PaystackCheckout'
import { kes,fmtDateTime } from './format'

export default async function PaystackInvoiceActions({ invoiceId,balance,depositDue,manager=false,waived=false }: {
  invoiceId: string; balance: number; depositDue: number; manager?: boolean; waived?: boolean
}) {
  const attempts = await invoicePaystackAttempts(invoiceId)
  const needsReview = attempts.some(a => a.status === 'review' && !a.reviewed_at)
  const labels: Record<string,string> = { initializing:'Preparing checkout',pending:'Awaiting payment confirmation',success:'Payment confirmed',failed:'Payment failed',abandoned:'Checkout not completed',review:'Team review required' }
  return <div className="space-y-2 no-print">
    {!manager && needsReview && <p className="hint">Please contact your analyst to confirm the previous payment before paying again.</p>}
    {!manager && !needsReview && !waived && balance > 0 && paystackEnabled() && <PaystackCheckout invoiceId={invoiceId} balance={balance} depositDue={depositDue} testMode={paystackConfig()!.environment === 'test'} />}
    {attempts.map(a => <div key={a.reference} className="text-sm text-ink-2 space-y-1">
      <p>{a.reviewed_at ? 'Reviewed by the team' : labels[a.status] ?? 'Being checked'} · {kes(Number(a.amount_minor)/100)}{a.channel ? ` · ${a.channel}` : ''} · {fmtDateTime(a.created_at)}</p>
      <p className="text-xs break-all">Reference: {a.reference}</p>
      {!manager && a.status !== 'success' && <Link href={`/portal/payments/return?reference=${encodeURIComponent(a.reference)}`}>Check payment status</Link>}
      {manager && a.last_error && <p className="hint">{a.last_error}</p>}
    </div>)}
  </div>
}
