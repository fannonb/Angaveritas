import Link from 'next/link'
import { briefProfile, type BriefContext } from '@/lib/service-briefs'

type Project = BriefContext & { code: string; onboarding_submitted_at: unknown; data_consent_at: unknown; payment_status: string; nda_status: string; lead_analyst_id: string | null; field_agent_id: string | null }
export default function VisitReadiness({ project, staff = false, paymentPending = false }: { project: Project; staff?: boolean; paymentPending?: boolean }) {
  const base = `${staff ? '/staff' : '/portal'}/projects/${project.code}`
  const profile = briefProfile(project)
  const rows = [
    { label:`${profile.tab} and consent`, ready:!!project.onboarding_submitted_at && !!project.data_consent_at, client:true, action:`Complete ${profile.tab.toLowerCase()}`, href:`${base}?tab=${staff ? 'site' : 'onboarding'}` },
    { label:'Deposit', ready:['deposit_received','paid','waived'].includes(project.payment_status), client:!paymentPending, action:'Pay deposit', href:`${base}?tab=operations`, detail:paymentPending ? 'Payment team is checking your reference. No need to pay again.' : '60% of your approved fee is due before work starts.' },
    { label:'Confidentiality agreement', ready:project.nda_status === 'signed', client:project.nda_status === 'prepared', action:'Review and sign', href:`${base}?tab=agreement`, detail:'Your analyst is preparing the agreement.', skip:project.nda_status === 'none' },
    { label:'Work team', ready:!!project.lead_analyst_id && !!project.field_agent_id, client:false, action:'Assign team', href:`${base}?tab=overview#team`, detail:'We will assign your analyst and field agent.' },
  ].filter(r => !r.skip)
  const clientTasks = rows.filter(r => !r.ready && r.client)
  const teamTasks = rows.filter(r => !r.ready && !r.client)
  const done = rows.filter(r => r.ready)
  // Once everything is ready the next step takes over; the checklist only earns its space while something is missing.
  if (!clientTasks.length && !teamTasks.length) return null
  const render = (items:typeof rows, actionable:boolean) => <ul className="divide-y divide-line">{items.map(r => <li key={r.label} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span className="min-w-0 flex-1"><strong>{r.label}</strong>{r.detail&&<span className="mt-1 block text-muted">{r.detail}</span>}</span>{actionable ? <Link className="btn btn-secondary btn-small" href={r.href}>{r.action}</Link> : <span className="chip chip--none">With our team</span>}</li>)}</ul>
  return <section className="panel panel-pad space-y-4" aria-label="Work preparation">
    <div className="flex flex-wrap justify-between gap-2"><h2 className="text-lg">Before work starts</h2><p className="text-sm text-muted">{done.length} of {rows.length} ready</p></div>
    <div><h3 className="text-base">{staff ? 'Waiting on the client' : 'Your tasks'}{clientTasks.length ? ` (${clientTasks.length})` : ''}</h3>{clientTasks.length ? render(clientTasks,!staff) : <p className="mt-2 text-sm text-ink-2">{staff ? 'The client has completed their preparation.' : 'You are all set. There is nothing else for you to do here.'}</p>}</div>
    {teamTasks.length>0&&<div><h3 className="text-base">{staff ? 'Team tasks' : 'With our team'}</h3>{render(teamTasks,staff)}</div>}
    {done.length>0&&<details><summary className="cursor-pointer text-sm text-muted">Completed ({done.length})</summary><ul className="mt-2 space-y-2 text-sm">{done.map(r=><li key={r.label} className="flex justify-between gap-2"><span>{r.label}</span><span className="text-ok">Complete</span></li>)}</ul></details>}
  </section>
}
