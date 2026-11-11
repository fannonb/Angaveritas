'use client'
import { useState } from 'react'
import { kes } from './format'

// `resume`: a checkout opened in the last 30 minutes exists; starting checkout again reopens that same one.
export default function PaystackCheckout({ invoiceId, balance, depositDue, testMode, resume = false }: { invoiceId: string; balance: number; depositDue: number; testMode: boolean; resume?: boolean }) {
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  async function checkout(purpose: 'deposit' | 'balance') {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/payments/checkout',{ method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify({invoiceId,purpose}) })
      const result = await response.json()
      if (!response.ok || !result.checkoutUrl) throw new Error(result.error ?? 'Checkout is unavailable. Please try again shortly.')
      const url = new URL(result.checkoutUrl)
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com') throw new Error('Checkout could not be opened.')
      window.location.assign(url.href)
    } catch (e) { setError(e instanceof Error ? e.message : 'Checkout could not be opened.'); setBusy(false) }
  }
  return <div className="no-print space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      {depositDue >= 3 && depositDue < balance && <button className="btn btn-primary" disabled={busy} onClick={() => checkout('deposit')}>Pay deposit {kes(depositDue)}</button>}
      {balance >= 3 && <button className={`btn ${depositDue>0 && depositDue < balance ? 'btn-secondary' : 'btn-primary'}`} disabled={busy} onClick={() => checkout('balance')}>{busy ? 'Opening Paystack…' : resume ? `Continue payment ${kes(balance)}` : `Pay ${depositDue>0 && depositDue < balance ? 'in full' : ''} ${kes(balance)}`.replace('  ', ' ')}</button>}
    </div>
    <p className="hint">Card or M-Pesa, through Paystack.{testMode ? ' Test mode: use Paystack test details.' : ''}</p>
    {error && <p className="text-sm text-bad" role="alert">{error}</p>}
  </div>
}
