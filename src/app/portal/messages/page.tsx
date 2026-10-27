import Link from 'next/link'
import { requireClient } from '@/lib/auth/session'
import { listProjectsForClient } from '@/lib/data/projects'
import { listRequestsForClient } from '@/lib/data/requests'

export const metadata = { title:'Messages' }
export default async function MessagesPage() {
  const user = await requireClient()
  const [projects,requests] = await Promise.all([listProjectsForClient(user.id),listRequestsForClient(user.id)])
  const standalone = requests.filter(r => !r.project_id && !r.parent_project_id)
  return <div className="space-y-5"><h1 className="app-title">Messages</h1><p className="text-ink-2">Choose the project you want to discuss. Its conversation includes the original enquiry and any follow-up work.</p><section className="panel">{projects.length + standalone.length === 0 ? <p className="empty">Conversations appear when you send an enquiry. <Link href="/estimate">Start an enquiry</Link>.</p> : <ul className="divide-y divide-line">{projects.map(p => <li key={p.id}><Link className="block px-6 py-4 font-semibold" href={`/portal/projects/${p.code}?tab=messages`}>{p.title}<span className="block text-sm font-normal text-muted">{p.code} · {p.analyst_name ?? 'Your team'}</span></Link></li>)}{standalone.map(r => <li key={r.id}><Link className="block px-6 py-4 font-semibold" href={`/portal/requests/${r.reference}#messages`}>{r.title}<span className="block text-sm font-normal text-muted">{r.reference} · Enquiry</span></Link></li>)}</ul>}</section></div>
}
