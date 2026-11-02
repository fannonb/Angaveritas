import { requireStaff } from '@/lib/auth/session'
import { integrationStatus } from '@/lib/integrations'
import { sql } from '@/lib/db'
import { fmtDateTime } from '@/components/app/format'
import { retryEmailAction, retryPaystackEventAction, reviewPaystackAttemptAction } from './actions'
export default async function IntegrationsPage() {
  await requireStaff(['admin'])
  const emails = await sql`select id,subject,recipients,status,attempts,last_error,created_at from email_outbox order by created_at desc limit 50`
  const payments = await sql`select a.reference,a.status,a.last_error,a.created_at,i.code invoice_code,p.code project_code from paystack_attempts a
    join invoices i on i.id=a.invoice_id join projects p on p.id=i.project_id where a.status in ('initializing','pending') or (a.status='review' and a.reviewed_at is null) order by a.created_at desc limit 50`
  const events = await sql`select event_id,payload->>'event' event_type,
    coalesce(payload->'data'->>'transaction_reference',payload->'data'->>'reference',payload->'data'->>'id') provider_reference,status,last_error,received_at from gateway_events
    where provider='paystack' and status in ('pending','review') order by received_at desc limit 30`
  return <div className="space-y-6"><h1 className="app-title">Integrations and delivery</h1>
    <section className="panel panel-pad space-y-3"><h2 className="text-lg">Configuration</h2>{integrationStatus().map(i => <div key={i.name}><strong>{i.name} · {i.ready ? 'Configured' : 'Not connected'}</strong><p className="hint">{i.detail}</p></div>)}</section>
    <section className="panel panel-pad space-y-3"><h2 className="text-lg">Paystack reconciliation</h2>
      <p className="hint">Pending payments are checked by the scheduled worker. Review flagged payments in Paystack before recording funds manually or refunding. A retry verifies provider records; it does not override billing checks.</p>
      {!payments.length && !events.length && <p className="text-sm">No payments need attention.</p>}
      {payments.map(p => <article key={p.reference} className="rounded border border-line p-3 space-y-1">
        <a href={`/staff/projects/${p.project_code}?tab=operations`} className="font-semibold">{p.invoice_code} · {p.status}</a>
        <p className="text-xs break-all">{p.reference} · {fmtDateTime(p.created_at)}</p>{p.last_error && <p className="hint">{p.last_error}</p>}
        {p.status === 'review' && <form action={reviewPaystackAttemptAction} className="space-y-2">
          <input type="hidden" name="reference" value={p.reference} />
          <label className="label">How were the funds reconciled?<input className="input" name="note" required minLength={10} maxLength={2000} placeholder="Refund or manual ledger entry reference and outcome" /></label>
          <p className="hint">Mark reviewed only after checking the money movement. This reopens checkout but does not record a payment or refund.</p>
          <button className="btn btn-secondary btn-xs">Mark reviewed</button>
        </form>}
      </article>)}
      {events.map(e => <article key={e.event_id} className="rounded border border-line p-3 space-y-1">
        <strong>{e.event_type} · {e.status}</strong><p className="hint">{fmtDateTime(e.received_at)}{e.last_error ? ` · ${e.last_error}` : ''}</p>
        {e.provider_reference && <p className="text-xs break-all">Provider reference / ID: {e.provider_reference}</p>}
        <form action={retryPaystackEventAction}><input type="hidden" name="id" value={e.event_id} /><button className="btn btn-secondary btn-xs">Retry verification</button></form>
      </article>)}
    </section>
    <section className="panel panel-pad space-y-3"><h2 className="text-lg">Email delivery</h2><p className="hint">Pending messages are retained until email is configured. The worker retries failed messages; a provider key and scheduled worker are required for reliable delivery.</p>
      {emails.map(e => <article key={e.id} className="rounded border border-line p-3 space-y-1"><strong>{e.subject}</strong><p className="text-sm">{e.recipients.join(', ')} · {e.status} · {e.attempts} attempt(s) · {fmtDateTime(e.created_at)}</p>{e.last_error && <p className="hint">{e.last_error}</p>}{e.status !== 'sent' && e.status !== 'sending' && <form action={retryEmailAction}><input type="hidden" name="id" value={e.id} /><button className="btn btn-secondary btn-xs" type="submit">Retry delivery</button></form>}</article>)}
    </section>
  </div>
}
