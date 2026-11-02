'use client'
import { useState } from 'react'
import { kes } from './format'

export default function PaystackCheckout({ invoiceId, balance, depositDue, testMode }: { invoiceId: string; balance: number; depositDue: number; testMode: boolean }) {
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
      {depositDue >= 3 && depositDue < balance && <button className="btn btn-primary btn-small" disabled={busy} onClick={() => checkout('deposit')}>Pay deposit · {kes(depositDue)}</button>}
      {balance >= 3 && <button className="btn btn-secondary btn-small" disabled={busy} onClick={() => checkout('balance')}>{busy ? 'Opening checkout…' : `Pay balance · ${kes(balance)}`}</button>}
    </div>
    <p className="hint">{testMode ? 'Test checkout — use Paystack test payment details.' : 'Pay securely through Paystack. Available payment methods appear at checkout.'}</p>
    {error && <p className="text-sm text-bad" role="alert">{error}</p>}
  </div>
}
