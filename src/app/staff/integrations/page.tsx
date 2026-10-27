import { requireStaff } from '@/lib/auth/session'
import { integrationStatus } from '@/lib/integrations'
import { sql } from '@/lib/db'
import { fmtDateTime } from '@/components/app/format'
import { retryEmailAction } from './actions'
export default async function IntegrationsPage() {
  await requireStaff(['admin'])
  const emails = await sql`select id,subject,recipients,status,attempts,last_error,created_at from email_outbox order by created_at desc limit 50`
  return <div className="space-y-6"><h1 className="app-title">Integrations and delivery</h1>
    <section className="panel panel-pad space-y-3"><h2 className="text-lg">Configuration</h2>{integrationStatus().map(i => <div key={i.name}><strong>{i.name} · {i.ready ? 'Configured' : 'Not connected'}</strong><p className="hint">{i.detail}</p></div>)}</section>
    <section className="panel panel-pad space-y-3"><h2 className="text-lg">Email delivery</h2><p className="hint">Pending messages are retained until email is configured. The worker retries failed messages; a provider key and scheduled worker are required for reliable delivery.</p>
      {emails.map(e => <article key={e.id} className="rounded border border-line p-3 space-y-1"><strong>{e.subject}</strong><p className="text-sm">{e.recipients.join(', ')} · {e.status} · {e.attempts} attempt(s) · {fmtDateTime(e.created_at)}</p>{e.last_error && <p className="hint">{e.last_error}</p>}{e.status !== 'sent' && e.status !== 'sending' && <form action={retryEmailAction}><input type="hidden" name="id" value={e.id} /><button className="btn btn-secondary btn-xs" type="submit">Retry delivery</button></form>}</article>)}
    </section>
  </div>
}
