import { projectOperations } from '@/lib/data/operations'
import { staffOperationsAction } from '@/app/staff/operations-actions'
import { clientOperationsAction } from '@/app/portal/operations-actions'
import { monitoringStatusLabels, ndaStatusLabels, serviceRequestLabels, serviceRequestStatusLabels } from '@/lib/labels'
import { site } from '@/lib/site'
import Uploader from './Uploader'
import PaymentNoticeForm from './PaymentNoticeForm'
import { kes, fmtDate, fmtDateTime } from './format'

// Billing and service for one project. Staff see every control; clients see their invoices, how to pay,
// and only the sections that apply to them.
export default async function OperationsPanel({ projectId, manager, section = 'all' }: { projectId: string; manager: boolean; section?: 'all' | 'billing' | 'agreement' | 'monitoring' | 'alerts' | 'settings' }) {
  const data = await projectOperations(projectId)
  const p = data.settings
  const hidden = (operation: string) => <><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="operation" value={operation} /></>
  const owing = data.invoices.filter((i) => i.status === 'issued' && i.paid_kes < i.amount_kes)
  const show = (name: typeof section) => section === 'all' || section === name

  const nextInvoiceRef = data.nextInvoiceCode || 'AVB-1001'
  const plainLabel = (i: { code: string; label: string }) => i.label.startsWith(`${i.code} · `) ? i.label.slice(i.code.length + 3) : i.label
  const invoiceHref = (i: { id: string }) => `/${manager ? 'staff' : 'portal'}/projects/${(p as any)?.code}/invoices/${i.id}`
  const invoicedKes = data.invoices.filter((i) => i.status === 'issued').reduce((s, i) => s + i.amount_kes, 0)
  const approvedTotal = (p as any)?.contract_value_kes || (p as any)?.proposal_total_kes || 0
  const approvedDeposit = (p as any)?.proposal_deposit_kes ?? approvedTotal
  const defaultLabel = (p as any)?.title || 'Ground Verification'
  const defaultDueDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' })

  return <div className="space-y-6">
    {show('billing') && <section className="panel panel-pad space-y-4">
      <h2 className="text-lg">{manager ? 'Billing and receipts' : 'Invoices and payments'}</h2>
      {manager && <p className="hint">Record each payment against its invoice. Online M-Pesa and card checkout will become available after a payment provider is connected.</p>}
      {!data.invoices.length && <p className="empty">{manager ? 'No invoice has been issued yet.' : 'No invoice yet. It appears here when you accept a proposal.'}</p>}
      {data.invoices.map((i) => {
        const balance = Math.max(0, i.amount_kes - i.paid_kes)
        const beforeVisit = Math.max(0, i.deposit_kes - i.paid_kes)
        const overdue = i.status === 'issued' && balance > 0 && !!i.due_on && String(i.due_on).slice(0, 10) < today
        return <article key={i.id} className="rounded border border-line p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong>{i.code} · {plainLabel(i)}</strong>
            <span className="flex flex-wrap gap-1.5">
              {overdue && <span className="chip chip--bad">Overdue</span>}
              <span className={`chip ${i.status === 'cancelled' ? 'chip--none' : balance === 0 ? 'chip--ok' : 'chip--warn'}`}>{i.status === 'cancelled' ? 'Cancelled' : balance === 0 ? 'Paid' : beforeVisit === 0 ? 'Deposit paid' : 'To pay'}</span>
            </span>
          </div>
          {i.status === 'cancelled' && i.cancel_reason && <p className="text-sm text-muted">Cancelled: {i.cancel_reason}</p>}
          <dl className="kv text-sm">
            <dt>Total</dt><dd>{kes(i.amount_kes)}</dd>
            <dt>Paid so far</dt><dd>{kes(i.paid_kes)}</dd>
            {i.status === 'issued' && balance > 0 && <><dt>Still to pay</dt><dd>{kes(balance)}{beforeVisit >= balance ? ', due before the site visit' : beforeVisit > 0 ? `, of which ${kes(beforeVisit)} before the site visit` : ''}</dd></>}
            {i.status === 'issued' && balance > 0 && i.due_on && <><dt>Due</dt><dd>{fmtDate(i.due_on)}{manager && i.reminder_sent_at ? ` · reminder sent ${fmtDate(i.reminder_sent_at)}` : ''}</dd></>}
          </dl>
          {data.payments.filter((payment) => payment.invoice_id === i.id).map((payment) => <p key={payment.id} className="text-sm text-ink-2">{payment.kind === 'refund' ? 'Refund' : 'Payment received'}: {kes(payment.amount_kes)} · ref {payment.reference} · {fmtDateTime(payment.created_at)}</p>)}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-sm">
            <a className="font-semibold" href={invoiceHref(i)}>{manager ? 'Preview invoice' : 'View invoice'}</a>
            <a href={`/api/invoices/${i.id}/pdf?download`}>Download PDF</a>
            {manager && i.status === 'issued' && <span className="text-muted">{i.sent_at ? `Emailed ${fmtDateTime(i.sent_at)}` : 'Not emailed yet'}</span>}
            {manager && i.status === 'issued' && i.paid_kes === 0 && (
              <details className="inline-block">
                <summary className="cursor-pointer text-xs text-bad hover:underline">Cancel invoice</summary>
                <form action={staffOperationsAction} className="mt-2 space-y-2 rounded border border-bad/30 bg-bad/5 p-2.5">
                  {hidden('cancel_invoice')}
                  <input type="hidden" name="invoiceId" value={i.id} />
                  <label className="label text-xs">
                    Reason
                    <input className="input text-xs" name="reason" required minLength={5} maxLength={200} defaultValue="Duplicate invoice issued in error" />
                  </label>
                  <button className="btn btn-danger btn-xs" type="submit">Confirm cancel</button>
                </form>
              </details>
            )}
          </div>
        </article>
      })}
      {!manager && owing.length > 0 && <HowToPay invoices={owing.map((i) => i.code)} />}
      {data.notices.length > 0 && <div className="space-y-3">
        <h3 className="text-base">Payment notifications</h3>
        {data.notices.map(n => <article key={n.id} className="rounded border border-line p-3 space-y-2 text-sm">
          <p><strong>{n.invoice_code} · {kes(n.amount_kes)}</strong> · ref {n.reference}</p>
          <p>{n.status === 'pending' ? 'Awaiting payment confirmation by the team' : n.status === 'confirmed' ? 'Confirmed and recorded' : 'Needs attention'}{n.response ? ` · ${n.response}` : ''}</p>
          {n.note && <p className="text-muted">{n.note}</p>}
          {manager && n.status === 'pending' && <>
            <form action={staffOperationsAction} className="space-y-2">{hidden('payment')}
              <input type="hidden" name="noticeId" value={n.id} /><input type="hidden" name="invoiceId" value={n.invoice_id} /><input type="hidden" name="amount" value={n.amount_kes} /><input type="hidden" name="reference" value={n.reference} /><input type="hidden" name="kind" value="payment" />
              <label className="label">Confirm against bank or M-Pesa records<input className="input" name="note" required maxLength={2000} placeholder="Where and when you verified the funds" /></label>
              <p className="hint">Confirming emails the client the updated invoice as their receipt.</p>
              <button className="btn btn-secondary btn-small">Confirm funds and record payment</button>
            </form>
            <details><summary className="cursor-pointer">Reference cannot be confirmed</summary><form action={staffOperationsAction} className="space-y-2 mt-2">{hidden('decline_notice')}<input type="hidden" name="noticeId" value={n.id} /><label className="label">What should the client correct?<input className="input" name="response" required minLength={5} maxLength={2000} /></label><button className="btn btn-secondary btn-small">Ask client to correct</button></form></details>
          </>}
        </article>)}
      </div>}
      {!manager && owing.length > 0 && <details className="rounded border border-line p-3">
        <summary className="cursor-pointer font-semibold">I have paid</summary>
        <div className="mt-3">
          <PaymentNoticeForm action={clientOperationsAction} projectId={projectId} owing={owing.map((i) => ({ id: i.id, code: i.code, label: plainLabel(i), balance: Math.max(0, i.amount_kes - i.paid_kes) }))} />
        </div>
      </details>}
      {manager && (
        <div className="space-y-4 pt-2">
          {data.invoices.length > 0 ? (
            <details className="rounded-xl border border-line bg-slate-50/50 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-ink flex items-center justify-between">
                <span>Issue supplementary invoice (Ref: {nextInvoiceRef})</span>
                <span className="chip chip--info text-xs font-normal">
                  {data.invoices.length} invoice{data.invoices.length > 1 ? 's' : ''} on record
                </span>
              </summary>
              <form action={staffOperationsAction} className="mt-4 space-y-4">
                {hidden('invoice')}
                <p className="text-xs text-muted">
                  Use this only for additional work beyond the accepted proposal. The contract proposal of {kes(approvedTotal)} is already invoiced ({kes(invoicedKes)} issued).
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="label">
                    Invoice description
                    <span className="opt block text-xs font-normal text-muted">
                      Ref: {nextInvoiceRef} (auto-assigned)
                    </span>
                    <input
                      className="input"
                      name="label"
                      placeholder="e.g. Additional boundary dispute survey"
                      required
                      maxLength={200}
                    />
                  </label>

                  <label className="label">
                    Due date
                    <span className="opt block text-xs font-normal text-muted">
                      Standard 14 days
                    </span>
                    <input
                      className="input"
                      name="dueOn"
                      type="date"
                      defaultValue={defaultDueDate}
                    />
                  </label>

                  <label className="label">
                    Total KES
                    <span className="opt block text-xs font-normal text-muted">
                      Amount for extra work
                    </span>
                    <input
                      className="input"
                      name="amount"
                      type="number"
                      min="1"
                      max="100000000"
                      placeholder="e.g. 5000"
                      required
                    />
                  </label>

                  <label className="label">
                    Required deposit KES
                    <span className="opt block text-xs font-normal text-muted">
                      Default 0 (deposit already fulfilled)
                    </span>
                    <input
                      className="input"
                      name="deposit"
                      type="number"
                      min="0"
                      max="100000000"
                      defaultValue="0"
                      required
                    />
                  </label>
                </div>

                <label className="check">
                  <input type="checkbox" name="beyondContract" defaultChecked /> This is additional work beyond the accepted proposal
                </label>
                <label className="check">
                  <input type="checkbox" name="send" defaultChecked /> Email the invoice to the client as a PDF now
                </label>
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <p className="text-xs text-muted">
                    Assigns reference <strong className="text-ink">{nextInvoiceRef}</strong> for {(p as any)?.title || 'this project'}.
                  </p>
                  <button className="btn btn-secondary" type="submit">
                    Issue supplementary invoice
                  </button>
                </div>
              </form>
            </details>
          ) : (
            <form action={staffOperationsAction} className="rounded-xl border border-line bg-slate-50/50 p-4 space-y-4">
              {hidden('invoice')}
              <div className="border-b border-line/60 pb-3">
                <h3 className="text-sm font-semibold text-ink">Issue project invoice</h3>
                <p className="text-xs text-muted">
                  Pre-filled from the approved proposal. Reference <strong className="text-ink">{nextInvoiceRef}</strong> is assigned automatically.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="label">
                  Invoice description
                  <span className="opt block text-xs font-normal text-muted">
                    Ref: {nextInvoiceRef} (auto-assigned)
                  </span>
                  <input
                    className="input"
                    name="label"
                    defaultValue={defaultLabel}
                    required
                    maxLength={200}
                  />
                </label>

                <label className="label">
                  Due date
                  <span className="opt block text-xs font-normal text-muted">
                    Standard 14 days
                  </span>
                  <input
                    className="input"
                    name="dueOn"
                    type="date"
                    defaultValue={defaultDueDate}
                  />
                </label>

                <label className="label">
                  Total KES
                  <span className="opt block text-xs font-normal text-muted">
                    Approved: {kes(approvedTotal)}
                  </span>
                  <input
                    className="input"
                    name="amount"
                    type="number"
                    min="1"
                    max="100000000"
                    defaultValue={approvedTotal || ''}
                    required
                  />
                </label>

                <label className="label">
                  Required deposit KES
                  <span className="opt block text-xs font-normal text-muted">
                    Approved deposit: {kes(approvedDeposit)}
                  </span>
                  <input
                    className="input"
                    name="deposit"
                    type="number"
                    min="0"
                    max="100000000"
                    defaultValue={approvedDeposit ?? ''}
                    required
                  />
                </label>
              </div>

              <label className="check">
                <input type="checkbox" name="send" defaultChecked /> Email the invoice to the client as a PDF now
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-xs text-muted">
                  Assigns reference <strong className="text-ink">{nextInvoiceRef}</strong> for {(p as any)?.title || 'this project'}.
                </p>
                <button className="btn btn-secondary" type="submit">
                  Issue invoice
                </button>
              </div>
            </form>
          )}

        {data.invoices.length > 0 && <form action={staffOperationsAction} className="rounded-xl border border-line bg-slate-50/50 p-4 space-y-4">{hidden('payment')}
          <div className="border-b border-line/60 pb-3">
            <h3 className="text-sm font-semibold text-ink">Record payment or refund manually</h3>
            <p className="text-xs text-muted">
              Record verified M-Pesa, wire or card transactions against an issued invoice. Payments email the client the updated invoice as their receipt.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="label">
              Invoice
              <select className="input" name="invoiceId">
                {data.invoices.filter((i) => i.status === 'issued').map((i) => {
                  const bal = Math.max(0, i.amount_kes - i.paid_kes)
                  return <option key={i.id} value={i.id}>{i.code} · {plainLabel(i)} ({kes(bal)} balance)</option>
                })}
              </select>
            </label>
            <label className="label">
              Entry type
              <select className="input" name="kind">
                <option value="payment">Payment received</option>
                <option value="refund">Refund paid</option>
              </select>
            </label>
            <label className="label">
              Amount KES
              <input className="input" name="amount" type="number" min="1" max="100000000" required />
            </label>
            <label className="label">
              Unique transaction reference
              <input className="input" name="reference" required maxLength={200} placeholder="e.g. QKH789XYZ1 or Wire ref" />
            </label>
            <label className="label sm:col-span-2">
              Reconciliation note
              <input className="input" name="note" required maxLength={2000} placeholder="Where and when you verified the funds" />
            </label>
          </div>
          <div className="pt-1">
            <button className="btn btn-secondary" type="submit">Record payment or refund</button>
          </div>
        </form>}
      </div>)}
    </section>}

    {show('agreement') && (manager || p.nda_status !== 'none') && <section className="panel panel-pad space-y-3">
      <h2 className="text-lg">Confidentiality agreement</h2>
      <p className="text-sm">Status: {ndaStatusLabels[p.nda_status] ?? p.nda_status}</p>
      {!manager && p.nda_status === 'requested' && <p className="hint">You asked for a confidentiality agreement. We will put it here for you to sign.</p>}
      {p.nda_file_id && <a className="btn btn-secondary btn-small" href={`/api/files/${p.nda_file_id}`} target="_blank" rel="noopener">Read the agreement</a>}
      {p.nda_status === 'signed' && <p className="text-sm">Signed by {p.nda_signed_name} on {fmtDateTime(p.nda_signed_at)}.</p>}
      {manager && p.nda_status !== 'signed' && <>
        <Uploader projectId={projectId} category="agreement" label="Upload approved NDA PDF" accept="application/pdf" />
        {data.agreements.length > 0 && <form action={staffOperationsAction} className="space-y-3">{hidden('nda')}
          <label className="label">NDA document<select className="input" name="fileId">{data.agreements.map((a) => <option key={a.id} value={a.id}>{a.filename}</option>)}</select></label>
          <button className="btn btn-secondary" type="submit">Send NDA for acceptance</button>
        </form>}
      </>}
      {!manager && p.nda_status === 'prepared' && <form action={clientOperationsAction} className="space-y-3">{hidden('nda')}
        <input type="hidden" name="fileId" value={p.nda_file_id} />
        <label className="label">Type your name exactly as it appears on your account<input className="input" name="name" required maxLength={120} /></label>
        <label className="check"><input type="checkbox" name="agree" required />I have read and accept the agreement linked above.</label>
        <button className="btn btn-primary" type="submit">Accept and sign</button>
      </form>}
    </section>}

    {show('monitoring') && (manager || p.monitoring_status !== 'inactive') && <section className="panel panel-pad space-y-3">
      <h2 className="text-lg">Recurring monitoring</h2>
      <p className="text-sm">{monitoringStatusLabels[p.monitoring_status] ?? p.monitoring_status}{p.monitoring_interval_days ? ` · a visit every ${p.monitoring_interval_days} days · ${kes(p.monitoring_fee_kes)} each` : ''}{p.next_cycle_on ? ` · next ${fmtDate(p.next_cycle_on)}` : ''}</p>
      <p className="hint">Each visit has its own invoice. {manager ? 'Schedule the visit once it is paid and the scope is confirmed.' : 'We schedule the visit once it is paid.'}</p>
      {p.monitoring_status === 'active' && (!p.monitoring_accepted_at || p.monitoring_accepted_version !== p.monitoring_plan_version) && <>
        <p className="alert alert-warn">{manager ? 'Waiting for the client to accept these terms. New cycles cannot be generated or dispatched yet.' : 'Review the fee and visit frequency above before accepting. Each cycle will be invoiced separately.'}</p>
        {!manager && <form action={clientOperationsAction} className="space-y-3">{hidden('monitoring_accept')}<input type="hidden" name="version" value={p.monitoring_plan_version} /><label className="check"><input type="checkbox" name="agree" required />I agree to {kes(p.monitoring_fee_kes)} per visit, every {p.monitoring_interval_days} days{p.monitoring_end_on ? ` until ${fmtDate(p.monitoring_end_on)}` : ', until I pause or cancel'}.</label><button className="btn btn-primary btn-small">Accept monitoring plan</button></form>}
      </>}
      {p.monitoring_accepted_at && p.monitoring_accepted_version === p.monitoring_plan_version && <p className="text-sm text-ok">Client accepted {fmtDateTime(p.monitoring_accepted_at)}.</p>}
      {manager && <>
        <form action={staffOperationsAction} className="grid gap-3 sm:grid-cols-2">{hidden('monitoring')}
          <label className="label">Plan status<select className="input" name="status" defaultValue={p.monitoring_status === 'inactive' ? 'active' : p.monitoring_status}>{['active', 'paused', 'cancelled'].map((s) => <option key={s} value={s}>{monitoringStatusLabels[s]}</option>)}</select></label>
          <label className="label">Days between visits<input className="input" type="number" name="interval" min="7" max="366" defaultValue={p.monitoring_interval_days ?? 30} required /></label>
          <label className="label">Fee per visit, KES<input className="input" type="number" name="fee" min="1" max="100000000" defaultValue={p.monitoring_fee_kes ?? ''} required /></label>
          <label className="label">Next visit<input className="input" type="date" name="next" defaultValue={p.next_cycle_on ?? ''} required /></label>
          <label className="label">Plan end date <span className="opt">(optional)</span><input className="input" type="date" name="end" defaultValue={p.monitoring_end_on ?? ''} /></label>
          <button className="btn btn-secondary" type="submit">Save monitoring plan</button>
        </form>
        <form action={staffOperationsAction}>{hidden('cycles')}<button className="btn btn-secondary btn-small" type="submit">Generate due cycles</button></form>
      </>}
      {data.cycles.map((c) => <div key={c.id} className="flex flex-wrap items-center gap-3 text-sm"><span>{fmtDate(c.cycle_on)} · {c.inspection_code ?? (c.invoice_status === 'cancelled' ? `Invoice ${c.invoice_code} cancelled${c.invoice_cancel_reason ? ` (${c.invoice_cancel_reason})` : ''}` : 'Waiting for payment, then scheduling')}</span>
        {manager && !c.inspection_id && c.invoice_status !== 'cancelled' && <form action={staffOperationsAction}>{hidden('dispatch')}<input type="hidden" name="cycleId" value={c.id} /><button className="btn btn-secondary btn-xs" type="submit">Schedule cycle visit</button></form>}
        {manager && !c.inspection_id && c.invoice_status === 'cancelled' && <form action={staffOperationsAction}>{hidden('reissue_cycle')}<input type="hidden" name="cycleId" value={c.id} /><button className="btn btn-secondary btn-xs" type="submit">Issue a new invoice for this cycle</button></form>}
      </div>)}
    </section>}

    {show('alerts') && (manager || data.alerts.length > 0) && <section className="panel panel-pad space-y-3">
      <h2 className="text-lg">Risk alerts</h2>
      {!data.alerts.length && <p className="empty">No alerts recorded.</p>}
      {data.alerts.map((a) => <article key={a.id} className="rounded border border-line p-3 space-y-2"><strong>{a.title}</strong><p className="text-sm">{a.detail}</p>
        <p className="hint">{a.resolved_at ? `Resolved: ${a.resolution}` : a.acknowledged_at ? (manager ? 'Acknowledged by the client; awaiting resolution' : 'You have seen this. We will update you when it is resolved.') : 'Open'}</p>
        {!a.resolved_at && (manager ? <form action={staffOperationsAction} className="space-y-2">{hidden('alert')}<input type="hidden" name="alertId" value={a.id} /><label className="label">Resolution<input className="input" name="resolution" required minLength={5} maxLength={2000} /></label><button className="btn btn-secondary btn-small" type="submit">Resolve alert</button></form>
          : !a.acknowledged_at && <form action={clientOperationsAction}>{hidden('acknowledge')}<input type="hidden" name="alertId" value={a.id} /><button className="btn btn-secondary btn-small" type="submit">I have seen this</button></form>)}
      </article>)}
    </section>}

    {show('settings') && <section className="panel panel-pad space-y-3">
      <h2 className="text-lg">{manager ? 'Service and privacy requests' : 'Changes and privacy'}</h2>
      {manager && !data.requests.length && <p className="empty">No requests from the client.</p>}
      {data.requests.map((r) => <article key={r.id} className="rounded border border-line p-3 space-y-2"><strong>{serviceRequestLabels[r.kind] ?? r.kind} · {serviceRequestStatusLabels[r.status] ?? r.status}</strong><p className="text-sm">{r.reason}</p>{r.resolution && <p className="text-sm">Response: {r.resolution}</p>}
        {manager && r.status === 'requested' && <form action={staffOperationsAction} className="space-y-2">{hidden('resolve')}<input type="hidden" name="requestId" value={r.id} />
          <label className="label">Response<textarea className="input" name="resolution" minLength={5} required maxLength={2000} /></label>
          <select className="input" name="status" aria-label="Decision"><option value="completed">Completed</option><option value="declined">Declined with explanation</option></select><button className="btn btn-secondary btn-small" type="submit">Record response</button>
        </form>}
      </article>)}
      {!manager && <details>
        <summary className="cursor-pointer font-semibold">Cancel, pause or ask about your data</summary>
        <form action={clientOperationsAction} className="mt-3 space-y-3">{hidden('request')}
          <label className="label">What do you need?<select className="input" name="kind">{Object.entries(serviceRequestLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="label">Tell us more<textarea className="input" name="reason" required minLength={5} maxLength={2000} /></label>
          <p className="hint">We reply here and by email, and confirm any refund or records we must keep.</p><button className="btn btn-secondary" type="submit">Send request</button>
        </form>
      </details>}
    </section>}
  </div>
}

function HowToPay({ invoices }: { invoices: string[] }) {
  const { mpesaPaybill, bankDetails } = site.payment
  const reference = invoices.join(' or ')
  return (
    <div className="space-y-3 rounded-lg border border-line bg-paper p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">How to pay</h3>
        <span className="chip chip--neutral text-xs">Official channels only</span>
      </div>
      <p className="text-ink-2">
        Use your invoice number (<strong>{reference}</strong>) as the transaction reference so the finance team can match your payment immediately.
      </p>
      {mpesaPaybill || bankDetails ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {mpesaPaybill && (
            <div className="rounded border border-line bg-surface p-3 space-y-1">
              <strong className="block text-ink">Lipa na M-Pesa (Paybill)</strong>
              <p className="text-ink-2">Business No: <strong>{mpesaPaybill}</strong></p>
              <p className="text-ink-2">Account No: <strong>{reference}</strong></p>
            </div>
          )}
          {bankDetails && (
            <div className="rounded border border-line bg-surface p-3 space-y-1">
              <strong className="block text-ink">Bank EFT / Wire transfer</strong>
              <p className="text-ink-2">{bankDetails}</p>
              <p className="text-ink-2">Reference: <strong>{reference}</strong></p>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded border border-line bg-surface p-3 text-ink-2">
          <p>Bank wire and Lipa na M-Pesa payment details are issued with your official invoice document and sent to your email.</p>
          <p className="mt-1">Always use your invoice number (<strong>{reference}</strong>) as the payment reference.</p>
        </div>
      )}
      <p className="text-xs text-muted">
        <strong>Security note:</strong> We confirm all payments on this dashboard within one business day. AngaVeritas personnel will never ask you to transfer funds to a personal mobile number or personal bank account.
      </p>
    </div>
  )
}
