import Link from 'next/link'
import { RequestChip } from '@/components/app/bits'
import { fmtDate, kes } from '@/components/app/format'
import { requireStaff } from '@/lib/auth/session'
import { listRequests, requestCounts } from '@/lib/data/requests'
import { requestStatusLabels, type RequestStatus } from '@/lib/labels'

export const metadata = { title: 'Requests' }

export default async function StaffRequests({ searchParams: searchParamsPromise }: { searchParams: Promise<{ status?: string; q?: string; owner?: string }> }) {
  const searchParams = await searchParamsPromise
  const user = await requireStaff(['analyst', 'admin'])
  const status = (searchParams.status && (searchParams.status in requestStatusLabels || ['open', 'all'].includes(searchParams.status)) ? searchParams.status : 'open') as RequestStatus | 'open' | 'all'
  const owner = searchParams.owner === 'unassigned' || searchParams.owner === 'me' ? searchParams.owner : undefined
  const [rows, counts] = await Promise.all([listRequests({ status, search: searchParams.q, owner, viewerId: user.id }), requestCounts()])
  const filters: [string, string, number | undefined][] = [
    ['open', 'Open', (counts.submitted ?? 0) + (counts.in_review ?? 0) + (counts.proposal_sent ?? 0)],
    ['submitted', 'New', counts.submitted],
    ['in_review', 'In review', counts.in_review],
    ['proposal_sent', 'Proposal sent', counts.proposal_sent],
    ['accepted', 'Accepted', counts.accepted],
    ['declined', 'Declined', counts.declined],
    ['all', 'All', undefined],
  ]
  const href = (next: { status?: string; owner?: string; q?: string } = {}) => {
    const params = new URLSearchParams()
    params.set('status', next.status ?? status)
    const nextOwner = next.owner !== undefined ? next.owner : owner
    if (nextOwner) params.set('owner', nextOwner)
    const nextQuery = next.q !== undefined ? next.q : searchParams.q
    if (nextQuery) params.set('q', nextQuery)
    return `/staff/requests?${params.toString()}`
  }
  return (
    <div className="space-y-5">
      <div>
        <h1 className="app-title">Requests</h1>
        <p className="mt-1 text-ink-2">Every request from the calculator: qualify it, assign an owner, then send a proposal.</p>
        <p className="hint mt-1">The owner becomes the project&apos;s lead analyst when the client signs. Field agents are assigned after the project opens.</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <nav className="flex flex-wrap gap-1.5" aria-label="Filter by status">
            {filters.map(([key, label, n]) => (
              <Link key={key} href={href({ status: key })} className={`btn btn-xs ${status === key ? 'btn-primary' : 'btn-secondary'}`}>
                {label}{n !== undefined ? ` (${n})` : ''}
              </Link>
            ))}
          </nav>
          <nav className="flex flex-wrap gap-1.5" aria-label="Filter by owner">
            <Link href={href({ owner: '' })} className={`btn btn-xs ${!owner ? 'btn-primary' : 'btn-secondary'}`}>Any owner</Link>
            <Link href={href({ owner: 'unassigned' })} className={`btn btn-xs ${owner === 'unassigned' ? 'btn-primary' : 'btn-secondary'}`}>Unassigned</Link>
            <Link href={href({ owner: 'me' })} className={`btn btn-xs ${owner === 'me' ? 'btn-primary' : 'btn-secondary'}`}>Mine</Link>
          </nav>
        </div>
        <form className="flex gap-2">
          <input type="hidden" name="status" value={status} />
          {owner && <input type="hidden" name="owner" value={owner} />}
          <input className="input mt-0 w-64" name="q" defaultValue={searchParams.q} placeholder="Search reference, name, place…" />
          <button className="btn btn-secondary btn-small" type="submit">Search</button>
        </form>
      </div>
      <div className="table-scroll">
        <table className="table table--wide">
          <thead><tr><th>Request</th><th>Client</th><th>Service · location</th><th>Estimate</th><th>Received</th><th>Owner</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="empty">{searchParams.q || owner ? 'No requests match these filters.' : 'No requests here.'}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/staff/requests/${r.reference}`} className="font-semibold">{r.title}</Link>
                  <span className="block font-mono text-xs text-muted">{r.reference}{r.priority === 'high' ? ' · HIGH' : ''}{r.kind === 'follow_up' ? ` · follow-up ${r.parent_project_code}` : ''}</span>
                </td>
                <td className="dim">{r.client_name}<span className="block text-xs text-muted">{r.client_based_in ?? ''}</span></td>
                <td className="dim">{r.service_name ?? 'Custom'}<span className="block text-xs text-muted">{r.location_label ?? 'Location TBC'}</span></td>
                <td className="num">{r.total_kes ? kes(r.total_kes) : '—'}</td>
                <td className="dim">{fmtDate(r.created_at)}</td>
                <td className="dim">{r.owner_id === user.id ? <span className="font-semibold">You</span> : r.owner_name ?? <span className="text-warn">Unassigned</span>}</td>
                <td><RequestChip status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
