import Link from 'next/link'

export default function VisitReadiness({ project, staff = false }: { project: { code: string; onboarding_submitted_at: unknown; data_consent_at: unknown; payment_status: string; nda_status: string; lead_analyst_id: string | null; field_agent_id: string | null }; staff?: boolean }) {
  const base = `${staff ? '/staff' : '/portal'}/projects/${project.code}`
  const rows = [
    { label:'Site details and consent', ready:!!project.onboarding_submitted_at && !!project.data_consent_at, owner:'Client', href:`${base}?tab=${staff ? 'site' : 'onboarding'}` },
    { label:'Required deposit', ready:['deposit_received','paid','waived'].includes(project.payment_status), owner:staff ? 'Client / payment team' : 'Client / payment team', href:`${base}?tab=operations` },
    { label:'Confidentiality agreement', ready:project.nda_status === 'signed' || project.nda_status === 'none', owner:project.nda_status === 'prepared' ? 'Client' : 'Analyst', href:`${base}?tab=${staff ? 'agreement' : 'agreement'}`, optional:project.nda_status === 'none' },
    { label:'Visit team assigned', ready:!!project.lead_analyst_id && !!project.field_agent_id, owner:'Analyst', href:staff ? `${base}?tab=overview#team` : `${base}?tab=messages` },
  ]
  return <section className="panel panel-pad space-y-3" aria-label="Visit preparation">
    <div className="flex flex-wrap justify-between gap-2"><h2 className="text-lg">Ready for the visit</h2><p className="text-sm text-muted">{rows.filter(r => r.ready).length} of {rows.length} in place</p></div>
    <p className="hint">These can be completed in any order. The visit can start when all required items are ready.</p>
    <ul className="divide-y divide-line">{rows.map(r => <li key={r.label} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
      <span><strong>{r.label}</strong><span className="block text-muted">{r.optional ? 'Not requested' : r.ready ? 'Complete' : `Waiting on: ${r.owner}`}</span></span>
      {r.ready ? <span className="chip chip--plain chip--ok">{r.optional ? 'Not required' : 'Ready'}</span> : <Link className="btn btn-secondary btn-xs" href={r.href}>{r.label === 'Required deposit' ? 'Payment details' : staff || r.owner === 'Client' ? 'Review' : 'Ask analyst'}</Link>}
    </li>)}</ul>
  </section>
}
