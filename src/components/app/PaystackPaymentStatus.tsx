'use client'
import Link from 'next/link'
import { useEffect,useState } from 'react'

export default function PaystackPaymentStatus({ reference,initialStatus,invoiceHref,payHref,testMode }: { reference: string; initialStatus: string; invoiceHref: string; payHref: string; testMode: boolean }) {
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
  const ended = status === 'failed' || status === 'abandoned'
  const titles: Record<string,string> = { success:'Payment received', failed:'Payment did not go through', abandoned:'Payment not completed', review:'Payment being checked by our team' }
  const descriptions: Record<string,string> = {
    success:'Your invoice is updated and your receipt is on its way by email.',
    failed:'Nothing was recorded. You can try again now. If money left your account, message us with the reference below.',
    abandoned:'The checkout was closed before paying, so nothing was recorded. You can try again now.',
    review:'Please message your analyst with the reference below before paying again.',
    pending:'Waiting for confirmation from Paystack. If you finished paying, this updates on its own in a moment.',
    initializing:'Waiting for confirmation from Paystack. If you finished paying, this updates on its own in a moment.',
  }
  return <section className="panel panel-pad space-y-4" aria-live="polite">
    <h1 className="text-xl">{titles[status] ?? 'Checking your payment'}</h1>
    {testMode && <p className="hint">Test payment · no real money</p>}
    <p>{descriptions[status] ?? 'Your payment is being checked.'}</p>
    {message && <p className="hint">{message}</p>}
    <div className="flex flex-wrap gap-3">
      {ended && <Link className="btn btn-primary" href={payHref}>Try again</Link>}
      {(status === 'pending' || status === 'initializing') && <button className="btn btn-secondary btn-small" disabled={busy} onClick={() => check(true)}>{busy ? 'Checking…' : 'Check again'}</button>}
      <Link className={`btn ${ended ? 'btn-secondary' : 'btn-primary'} btn-small`} href={invoiceHref}>View invoice</Link>
    </div>
    <p className="text-xs break-all text-muted">Reference: {reference}</p>
  </section>
}
