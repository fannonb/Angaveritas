'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { kes } from './format'

type Owing = { id: string; code: string; label: string; balance: number }

function Submit() {
  const { pending } = useFormStatus()
  return <button className="btn btn-primary btn-small" disabled={pending}>{pending ? 'Sending…' : 'Send payment reference'}</button>
}

// The client's "I have paid" form. The amount starts at the balance still owed on the chosen invoice,
// so the client only confirms it or lowers it for a part payment.
export default function PaymentNoticeForm({ action, projectId, owing }: { action: (form: FormData) => void | Promise<void>; projectId: string; owing: Owing[] }) {
  const [invoiceId, setInvoiceId] = useState(owing[0]?.id ?? '')
  const selected = owing.find((i) => i.id === invoiceId) ?? owing[0]
  const [amount, setAmount] = useState(String(selected?.balance ?? ''))

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="operation" value="payment_notice" />
      <p className="hint">Send the transaction reference from your receipt. Your balance changes after the team confirms the funds.</p>
      <label className="label">Invoice
        <select className="input" name="invoiceId" value={invoiceId} onChange={(e) => {
          const next = owing.find((i) => i.id === e.target.value)
          setInvoiceId(e.target.value)
          setAmount(String(next?.balance ?? ''))
        }}>
          {owing.map((i) => <option key={i.id} value={i.id}>{i.code} · {i.label}</option>)}
        </select>
      </label>
      <label className="label">Amount sent, KES
        <input className="input" type="number" name="amount" min="1" max="100000000" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        {selected && <span className="hint block">Balance on this invoice: {kes(selected.balance)}. Change it only for a part payment.</span>}
      </label>
      <label className="label">Transaction reference<input className="input" name="reference" required minLength={3} maxLength={200} placeholder="e.g. QKH789XYZ1 or Wire ref" /></label>
      <label className="label">Payment method & note <span className="opt">(optional)</span><input className="input" name="note" maxLength={2000} placeholder="e.g. M-Pesa / Bank transfer" /></label>
      <Submit />
    </form>
  )
}
