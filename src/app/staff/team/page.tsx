import { fmtDateTime } from '@/components/app/format'
import { requireStaff } from '@/lib/auth/session'
import { listStaff } from '@/lib/data/users'
import { roleLabels } from '@/lib/labels'
import { resendInviteAction, setDisabledAction, setRoleAction } from '../actions'
import InviteForm from './InviteForm'

export const metadata = { title: 'Team' }

const roleHelp = [
  ['Field agent', 'Sees only the inspections and projects assigned to them: site details, contacts, checklist. Records findings and uploads evidence. No client finances or messages.'],
  ['Analyst', 'Runs the pipeline: qualifies requests, writes proposals, plans and reviews inspections, writes and reviews reports, messages clients. Can view pricing.'],
  ['Admin', 'Everything an analyst can do, plus team management, pricing changes and the full audit log.'],
]

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const me = await requireStaff(['admin'])
  const staff = await listStaff()
  return (
    <div className="space-y-6">
      {error && <p role="alert" className="alert alert-bad">{error}</p>}
      <div>
        <h1 className="app-title">Team</h1>
        <p className="mt-1 text-ink-2">Staff accounts are by invitation only. Clients register themselves on the website.</p>
      </div>
      <section className="panel panel-pad space-y-3">
        <h2 className="text-lg">Invite someone</h2>
        <InviteForm />
      </section>
      <div className="table-scroll">
        <table className="table table--wide">
          <thead><tr><th>Name</th><th>Role</th><th>Last sign-in</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td><strong>{s.full_name}</strong><span className="block text-sm text-muted">{s.email}</span></td>
                <td>
                  {s.id === me.id ? roleLabels[s.role] : (
                    <form action={setRoleAction} className="flex gap-2">
                      <input type="hidden" name="userId" value={s.id} />
                      <select className="input mt-0" name="role" defaultValue={s.role} aria-label="Role">
                        <option value="field_agent">Field agent</option>
                        <option value="analyst">Analyst</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button className="btn btn-secondary btn-xs" type="submit">Set</button>
                    </form>
                  )}
                </td>
                <td className="dim">{s.last_login_at ? fmtDateTime(s.last_login_at) : 'Never'}</td>
                <td className="dim">{s.disabled_at ? 'Disabled' : s.password_hash ? 'Active' : 'Invited'}</td>
                <td className="text-right">
                  {!s.password_hash && !s.disabled_at && (
                    <form action={resendInviteAction} className="inline">
                      <input type="hidden" name="userId" value={s.id} />
                      <button className="linkish text-sm" type="submit">Resend invite</button>
                    </form>
                  )}
                  {s.id !== me.id && (
                    <form action={setDisabledAction} className="ml-3 inline">
                      <input type="hidden" name="userId" value={s.id} />
                      <input type="hidden" name="disable" value={s.disabled_at ? '0' : '1'} />
                      <button className={`linkish text-sm ${s.disabled_at ? '' : 'text-bad'}`} type="submit">{s.disabled_at ? 'Re-enable' : 'Disable'}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="panel panel-pad">
        <h2 className="text-lg">What each role can do</h2>
        <dl className="def-list mt-3">{roleHelp.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}</dl>
      </section>
    </div>
  )
}
