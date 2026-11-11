'use client'

import { useActionState, useState } from 'react'
import { saveInvoiceRevisionAction } from '@/app/staff/operations-actions'
import { requiredDeposit, type EditableInvoiceLine } from '@/lib/billing'
import { kes } from './format'
import { preserveForm } from './useFormDraft'

export default function InvoiceEditor({ invoice, initiallyOpen = false }: { initiallyOpen?: boolean; invoice: {
  id: string; projectId: string; returnTo: string; revision: number; label: string; lines: EditableInvoiceLine[];
  amount: number; approvedAmount: number; paid: number; dueOn: string | null
} }) {
  const [lines, setLines] = useState(invoice.lines)
  const [state,action,pending] = useActionState(saveInvoiceRevisionAction,null)
  const total = lines.reduce((sum, l) => sum + (Number.isFinite(l.amount) ? l.amount : 0), 0)
  const update = (at: number, patch: Partial<EditableInvoiceLine>) => setLines(old => old.map((l,i) => i === at ? {...l,...patch} : l))
  return <details id="edit-invoice" className="panel panel-pad mx-auto max-w-[820px] no-print" open={initiallyOpen}>
    <summary className="cursor-pointer font-semibold">Edit invoice / add a discount</summary>
    <form onSubmit={preserveForm(action)} className="mt-4 space-y-4">
      <input type="hidden" name="operation" value="revise_invoice" />
      <input type="hidden" name="projectId" value={invoice.projectId} />
      <input type="hidden" name="invoiceId" value={invoice.id} />
      <input type="hidden" name="revision" value={invoice.revision} />
      <input type="hidden" name="returnTo" value={invoice.returnTo} />
      <p className="hint">Adjust the description, items or due date at any stage. Payments stay recorded. The client sees the reason and revised invoice in their portal. The total can be restored up to the originally approved {kes(invoice.approvedAmount)}.</p>
      <label className="label">Invoice description<input name="label" className="input" defaultValue={invoice.label} required maxLength={200} /></label>
      <fieldset className="space-y-3"><legend className="label mb-2">Items and discounts</legend>
        {lines.map((line,i) => <div key={i} className="grid gap-2 rounded border border-line p-3 sm:grid-cols-[1fr_9rem_auto]">
          <label className="label">Description<input className="input" name="lineLabel" required maxLength={200} value={line.label} onChange={e => update(i,{label:e.target.value})} /></label>
          <label className="label">Amount (KES)<input className="input" name="lineAmount" type="number" required step="1" min="-100000000" max="100000000" value={Number.isFinite(line.amount) ? line.amount : ''} onChange={e => update(i,{amount:e.target.valueAsNumber})} /></label>
          <button type="button" className="btn btn-secondary btn-xs self-end" aria-label={`Remove item ${i+1}`} disabled={lines.length === 1} onClick={() => setLines(old => old.filter((_,at) => at !== i))}>Remove</button>
          <label className="label sm:col-span-3">Detail (optional)<input className="input" name="lineDetail" maxLength={200} value={line.detail ?? ''} onChange={e => update(i,{detail:e.target.value})} /></label>
        </div>)}
        <div className="flex flex-wrap gap-2"><button className="btn btn-secondary btn-xs" type="button" disabled={lines.length>=50} onClick={() => setLines(old => [...old,{label:'',amount:0}])}>Add item</button><button className="btn btn-secondary btn-xs" type="button" disabled={lines.length>=50} onClick={() => setLines(old => [...old,{label:'Agreed discount',amount:0}])}>Add discount</button></div>
        <p className="hint">Enter discounts as negative amounts, for example −1,000.</p>
      </fieldset>
      <dl className="kv rounded border border-line p-3 text-sm" aria-live="polite"><dt>Revised total</dt><dd>{kes(total)}</dd><dt>Deposit (60%)</dt><dd>{kes(requiredDeposit(total))}</dd><dt>Already paid</dt><dd>{kes(invoice.paid)}</dd><dt>{invoice.paid>total ? 'Refund to arrange' : 'Remaining balance'}</dt><dd>{kes(Math.abs(total-invoice.paid))}</dd></dl>
      {total < invoice.paid && <p className="alert alert-warn">The discount leaves {kes(invoice.paid-total)} overpaid. Save the revision, then arrange and record the refund. Saving does not transfer money.</p>}
      <label className="label">Due date (optional)<input name="dueOn" className="input" type="date" defaultValue={invoice.dueOn ?? ''} /></label>
      <label className="label">Reason shown to the client<textarea name="reason" className="input" required minLength={5} maxLength={2000} placeholder="e.g. Discount agreed with the client after the first visit" /></label>
      {state?.error&&<p className="alert alert-bad" role="alert">{state.error} Your changes are still here.</p>}
      <button className="btn btn-primary btn-small" disabled={pending}>{pending ? 'Saving…' : 'Save invoice changes'}</button>
    </form>
  </details>
}
