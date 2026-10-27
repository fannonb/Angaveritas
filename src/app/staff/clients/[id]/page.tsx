import Link from 'next/link'
import { notFound } from 'next/navigation'
import { HealthChip, RequestChip, StageChip } from '@/components/app/bits'
import { fmtDate, fmtDateTime, kes } from '@/components/app/format'
import { requireStaff } from '@/lib/auth/session'
import { listProjectsForStaff } from '@/lib/data/projects'
import { listRequests } from '@/lib/data/requests'
import { getUserById } from '@/lib/data/users'
import { setDisabledAction } from '../../actions'

export const metadata = { title: 'Client' }

export default async function ClientPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise
  const user = await requireStaff(['analyst', 'admin'])
  const c = await getUserById(params.id)
  if (!c || c.role !== 'client') notFound()
  const [requests, projects] = await Promise.all([listRequests({ status: 'all', clientId: c.id }), listProjectsForStaff(user, { stage: 'all', clientId: c.id })])
  const value = projects.reduce((s, p) => s + (p.contract_value_kes ?? 0), 0)
  return (
    <div className="space-y-6">
      <p className="text-sm"><Link href="/staff/clients">← Clients</Link></p>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="app-title">{c.full_name}</h1>
          <p className="mt-1 text-ink-2">Client since {fmtDate(c.created_at)} · lifetime value {kes(value)}</p>
        </div>
        {user.role === 'admin' && (
          <form action={setDisabledAction}>
            <input type="hidden" name="userId" value={c.id} />
            <input type="hidden" name="disable" value={c.disabled_at ? '0' : '1'} />
            <button className={`btn btn-small ${c.disabled_at ? 'btn-secondary' : 'btn-danger'}`} type="submit">{c.disabled_at ? 'Re-enable account' : 'Disable account'}</button>
          </form>
        )}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_2fr] xl:items-start">
        <section className="panel panel-pad">
          <dl className="kv">
            <dt>Email</dt><dd><a href={`mailto:${c.email}`}>{c.email}</a>{c.email_verified_at ? '' : ' (not confirmed)'}</dd>
            <dt>Phone</dt><dd>{c.phone ?? '—'}</dd>
            <dt>Based in</dt><dd>{c.based_in ?? '—'}</dd>
            <dt>Time zone</dt><dd>{c.timezone}</dd>
            <dt>Last sign-in</dt><dd>{fmtDateTime(c.last_login_at)}</dd>
            <dt>Status</dt><dd>{c.disabled_at ? 'Disabled' : 'Active'}</dd>
          </dl>
        </section>
        <div className="space-y-6">
          <section className="panel">
            <div className="panel-head"><h2>Projects</h2></div>
            {projects.length === 0 ? <p className="empty">None yet.</p> : (
              <ul className="divide-y divide-line">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/staff/projects/${p.code}`} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 text-ink no-underline hover:bg-paper">
                      <span><strong>{p.title}</strong><span className="block text-sm text-ink-2">{p.code} · {kes(p.contract_value_kes)}</span></span>
                      <span className="flex gap-2"><StageChip stage={p.stage} /><HealthChip health={p.health} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="panel">
            <div className="panel-head"><h2>Requests</h2></div>
            {requests.length === 0 ? <p className="empty">None yet.</p> : (
              <ul className="divide-y divide-line">
                {requests.map((r) => (
                  <li key={r.id}>
                    <Link href={`/staff/requests/${r.reference}`} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 text-ink no-underline hover:bg-paper">
                      <span><strong>{r.title}</strong><span className="block text-sm text-ink-2">{r.reference} · {fmtDate(r.created_at)}{r.total_kes ? ` · est. ${kes(r.total_kes)}` : ''}</span></span>
                      <RequestChip status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
