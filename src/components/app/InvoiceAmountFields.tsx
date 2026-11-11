'use client'
import { useState } from 'react'
import { requiredDeposit } from '@/lib/billing'
import { kes } from './format'

export default function InvoiceAmountFields({ initial = 0 }: { initial?: number }) {
  const [amount,setAmount] = useState(initial)
  return <div className="space-y-2 sm:col-span-2"><label className="label">Total for the agreed work (KES)<input className="input" name="amount" type="number" step="1" required min="1" max="100000000" value={amount || ''} onChange={e => setAmount(e.target.valueAsNumber || 0)} /></label><p className="hint" aria-live="polite">Deposit (60%): <strong>{kes(requiredDeposit(amount))}</strong> · Remaining balance: <strong>{kes(amount-requiredDeposit(amount))}</strong></p></div>
}
