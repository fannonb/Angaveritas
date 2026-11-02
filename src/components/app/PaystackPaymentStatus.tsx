'use client'
import Link from 'next/link'
import { useEffect,useState } from 'react'

export default function PaystackPaymentStatus({ reference,initialStatus,invoiceHref,testMode }: { reference: string; initialStatus: string; invoiceHref: string; testMode: boolean }) {
  const [status,setStatus] = useState(initialStatus)
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  async function check(verify: boolean) {
    setBusy(true)
    try {
      const response = await fetch(`/api/payments/status?reference=${encodeURIComponent(reference)}`,{method:verify ? 'POST' : 'GET',cache:'no-store'})
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Payment status is unavailable.')
      setStatus(result.status); setMessage(result.message ?? '')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Payment status is unavailable.') }
    finally { setBusy(false) }
  }
  useEffect(() => {
    void check(true)
    let polls = 0
    const timer = setInterval(() => { if (++polls > 24) clearInterval(timer); else void check(false) },5000)
    return () => clearInterval(timer)
    // A return from checkout triggers one server verification; later polling only reads saved status.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[reference])
  const descriptions: Record<string,string> = {
    success:'Your payment is confirmed and your invoice has been updated. Your receipt will be emailed to you.',
    failed:'This payment attempt failed. Open your invoice to try again. If money was deducted, contact the team with the reference below.',
    abandoned:'Checkout was not completed. Open your invoice to try again, or check again if you completed payment.',
    review:'Your payment needs a check by our team. Please contact your analyst with the reference below before paying again.',
    pending:'We are waiting for payment confirmation. If you paid, please check again before starting another payment.',
    initializing:'Checkout is being checked. If you paid, please wait for confirmation before starting another payment.',
  }
  return <section className="panel panel-pad space-y-4" aria-live="polite">
    <h1 className="text-xl">{status === 'success' ? 'Payment received' : 'Payment status'}</h1>
    {testMode && <p className="hint">Test payment · no live funds collected</p>}
    <p>{descriptions[status] ?? 'Your payment is being checked.'}</p>
    <p className="text-sm break-all">Reference: {reference}</p>
    {message && <p className="hint">{message}</p>}
    <div className="flex flex-wrap gap-3">
      {status !== 'success' && <button className="btn btn-secondary btn-small" disabled={busy} onClick={() => check(true)}>{busy ? 'Checking…' : 'Check again'}</button>}
      <Link className="btn btn-primary btn-small" href={invoiceHref}>View invoice</Link>
      <Link className="btn btn-secondary btn-small" href="/portal/payments">All payments</Link>
    </div>
  </section>
}
