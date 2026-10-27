import Link from 'next/link'
import { fmtDate } from '@/components/app/format'
import { requireStaff } from '@/lib/auth/session'
import { listClients } from '@/lib/data/users'

export const metadata = { title: 'Clients' }

export default async function ClientsPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ q?: string }> }) {
  const searchParams = await searchParamsPromise
  await requireStaff(['analyst', 'admin'])
  const clients = await listClients(searchParams.q)
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="app-title">Clients</h1>
          <p className="mt-1 text-ink-2">Everyone with a client account.</p>
        </div>
        <form className="flex gap-2">
          <input className="input mt-0 w-64" name="q" defaultValue={searchParams.q} placeholder="Name, email or phone" />
          <button className="btn btn-secondary btn-small" type="submit">Search</button>
        </form>
      </div>
      <div className="table-scroll">
        <table className="table table--wide">
          <thead><tr><th>Client</th><th>Contact</th><th>Based in</th><th>Requests</th><th>Projects</th><th>Joined</th></tr></thead>
          <tbody>
            {clients.length === 0 && <tr><td colSpan={6} className="empty">No clients found.</td></tr>}
            {clients.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/staff/clients/${c.id}`} className="font-semibold">{c.full_name}</Link>
                  {!c.email_verified_at && <span className="block text-xs text-warn">Email not confirmed</span>}
                  {c.disabled_at && <span className="block text-xs text-bad">Disabled</span>}
                </td>
                <td className="dim text-sm">{c.email}<span className="block">{c.phone ?? ''}</span></td>
                <td className="dim">{c.based_in ?? '—'}</td>
                <td className="num">{c.requests}</td>
                <td className="num">{c.active_projects} active / {c.projects}</td>
                <td className="dim">{fmtDate(c.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
