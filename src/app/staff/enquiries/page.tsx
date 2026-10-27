import Link from 'next/link'
import { fmtDateTime } from '@/components/app/format'
import { requireStaff } from '@/lib/auth/session'
import { listEnquiries, type EnquiryRow } from '@/lib/data/misc'
import { enquiryStatusAction } from '../actions'
import { manageEnquiryAction } from './actions'
import { listAssignableStaff } from '@/lib/data/users'

export const metadata = { title: 'Website enquiries' }

export default async function EnquiriesPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  const searchParams = await searchParamsPromise
  await requireStaff(['analyst', 'admin'])
  const status = (['open', 'replied', 'converted', 'closed', 'all'].includes(searchParams.status ?? '') ? searchParams.status : 'open') as EnquiryRow['status'] | 'open' | 'all'
  const rows = await listEnquiries(status)
  const staff = await listAssignableStaff()
  return (
    <div className="space-y-5">
      {searchParams.error && <p role="alert" className="alert alert-bad">{searchParams.error}</p>}
      <div>
        <h1 className="app-title">Website enquiries</h1>
        <p className="mt-1 text-ink-2">Messages from the contact form. Reply by email or phone, then invite them to get an estimate.</p>
      </div>
      <nav className="flex flex-wrap gap-1.5">
        {(['open', 'replied', 'converted', 'closed', 'all'] as const).map((s) => (
          <Link key={s} href={`/staff/enquiries?status=${s}`} className={`btn btn-xs ${status === s ? 'btn-primary' : 'btn-secondary'}`}>{s === 'open' ? 'New' : s[0].toUpperCase() + s.slice(1)}</Link>
        ))}
      </nav>
      <div className="space-y-3">
        {rows.length === 0 && <p className="panel empty">Nothing here.</p>}
        {rows.map((e) => (
          <article key={e.id} className="panel panel-pad">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg">{e.name}{e.company ? <span className="font-normal text-muted"> · {e.company}</span> : null}</h2>
                <p className="text-sm text-ink-2">
                  <a href={`mailto:${e.email}?subject=${encodeURIComponent('Your enquiry to AngaVeritas')}`}>{e.email}</a> · {e.phone ?? '—'} · prefers {e.preferred_contact ?? 'email'}
                  {e.based_in ? ` · based in ${e.based_in}` : ''}
                </p>
                <p className="text-xs text-muted">{fmtDateTime(e.created_at)}{e.service ? ` · ${e.service}` : ''}{e.project_location ? ` · ${e.project_location}` : ''}</p>
              </div>
              <form action={enquiryStatusAction} className="flex gap-2">
                <input type="hidden" name="id" value={e.id} />
                <select className="input mt-0" name="status" defaultValue={e.status} aria-label="Status">
                  <option value="new">New</option>
                  <option value="replied">Replied</option>
                  <option value="converted">Became a client</option>
                  <option value="closed">Closed</option>
                </select>
                <button className="btn btn-secondary btn-small" type="submit">Update</button>
              </form>
            </div>
            <p className="mt-3 whitespace-pre-line">{e.message}</p>
            <form action={manageEnquiryAction} className="mt-4 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="id" value={e.id} />
              <label className="label">Owner<select className="input" name="ownerId" defaultValue={e.owner_id ?? ''}><option value="">Unassigned</option>{staff.filter(s => s.role !== 'field_agent').map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></label>
              <label className="label">Follow-up date<input className="input" type="date" name="followUp" defaultValue={e.next_follow_up ?? ''} /></label>
              <label className="label sm:col-span-2">Consultation and qualification notes<textarea className="input" name="notes" defaultValue={e.internal_notes ?? ''} maxLength={4000} /></label>
              <button className="btn btn-secondary btn-small" type="submit" name="intent" value="save">Save follow-up</button>
              {!e.request_id && <button className="btn btn-primary btn-small" type="submit" name="intent" value="convert">Convert to client request</button>}
            </form>
          </article>
        ))}
      </div>
    </div>
  )
}
