import { engagementDetails } from '@/lib/data/engagements'
import { workflowAction } from '@/app/workflow-actions'
import { fmtDate, kes } from './format'

export default async function EngagementPanel({projectId,manager=false,admin=false}:{projectId:string;manager?:boolean;admin?:boolean}) {
  const {work,cases,visits}=await engagementDetails(projectId)
  const current=work.find(w=>w.id===w.active_work_order_id)
  const hidden=(operation:string)=><><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="operation" value={operation}/></>
  return <div className="space-y-6">
    {current&&<section className="panel panel-pad space-y-3" id="engagement">
      <p className="kicker">Current engagement</p><h2 className="text-lg">{current.title}</h2>
      <p className="prose-text">{current.scope||'Scope is in the accepted proposal.'}</p>
      {current.hold_reason&&<p className="alert alert-warn" role="status">Work on hold: {current.hold_reason}</p>}
      <p className="hint">{current.brief_approved_version===current.brief_version?`Brief checked${current.approved_by_name?` by ${current.approved_by_name}`:''}.`:!(current.onboarding_submitted_at&&current.data_consent_at)?'Waiting for the client to send the brief. You check it against this scope once it arrives.':'The client sent the brief. Check it against this scope below before work starts.'} {current.due_on?`Report expected ${fmtDate(current.due_on)}.`:''}</p>
      {manager&&current.onboarding_submitted_at&&current.data_consent_at&&current.brief_approved_version!==current.brief_version&&<form action={workflowAction} className="space-y-3">
        {hidden('approve_brief')}<input type="hidden" name="version" value={current.brief_version}/>
        <label className="label">Required site visits or work sessions<input className="input" name="sites" type="number" min="1" max="100" defaultValue={current.required_sites} required/></label>
        <label className="check"><input type="checkbox" required/>I checked the submitted brief against the accepted scope and contact restrictions.</label>
        <button className="btn btn-primary btn-small">Approve brief for planning</button>
      </form>}
      {!manager&&!current.data_consent_at&&<form action={workflowAction} className="space-y-3">{hidden('consent')}
        <label className="check"><input type="checkbox" name="agree" required/>I renew consent to process the project information for the agreed work. The team will confirm before resuming.</label>
        <button className="btn btn-primary btn-small">Renew consent</button></form>}
      {manager&&current.hold_reason&&current.data_consent_at&&<form action={workflowAction} className="space-y-3">{hidden('resume')}
        <label className="label">Reason to resume<input className="input" name="note" minLength={5} required/></label><button className="btn btn-secondary btn-small">Resume work</button></form>}
      {work.length>1&&<details><summary className="cursor-pointer">Engagement history ({work.length})</summary><ul className="space-y-3 mt-3">{work.map(w=><li key={w.id}><strong>{w.title}</strong> · {fmtDate(w.created_at)}{w.id===current.id?' · current':''}
        {manager&&w.id!==current.id&&<form action={workflowAction}>{hidden('select_work')}<input type="hidden" name="workId" value={w.id}/><button className="linkish">Manage this engagement</button></form>}
      </li>)}</ul></details>}
    </section>}
    {!manager&&visits.length>0&&<section className="panel panel-pad space-y-4"><h2 className="text-lg">Visit arrangements</h2>{visits.map(v=><article key={v.id} className="space-y-3 border-b border-line pb-4">
      <p><strong>{v.title}</strong> · {fmtDate(v.scheduled_for)} · {v.arrival_window??'Time to confirm'} (Kenya time)</p>
      {v.client_confirmed_at?<p className="hint">Access confirmed.</p>:<form action={workflowAction} className="space-y-2">{hidden('confirm_visit')}<input type="hidden" name="inspectionId" value={v.id}/><input type="hidden" name="version" value={v.schedule_version}/><label className="check"><input type="checkbox" name="agree" required/>The site contact is expecting the team and access is arranged.</label><button className="btn btn-secondary btn-small">Confirm access</button></form>}
      <details><summary>Request another date</summary><form action={workflowAction} className="space-y-3 mt-3">{hidden('case')}<input type="hidden" name="kind" value="reschedule"/><input type="hidden" name="inspectionId" value={v.id}/><label className="label">Preferred date<input className="input" type="date" name="date" required/></label><label className="label">Reason<textarea className="input" name="detail" minLength={10} required/></label><button className="btn btn-secondary btn-small">Request reschedule</button></form></details>
    </article>)}</section>}
    {/* With nothing open, requests stay a one-line panel so they don't compete with the next step. */}
    <details className="panel panel-pad space-y-4" open={cases.length>0}><summary className="cursor-pointer list-none"><h2 className="inline text-lg">Requests and decisions</h2> <span className="text-sm text-muted">{cases.length?`${cases.length} tracked`:'None open'}</span></summary>
      {cases.length===0&&<p className="hint mt-3">Clarifications, issues, scope changes and cancellations are tracked here with an owner and a due date.</p>}
      {cases.filter(c=>manager||c.kind!=='report_correction').map(c=><article key={c.id} className="rounded border border-line p-4 space-y-2">
        <div className="flex flex-wrap justify-between gap-2"><strong>{c.title}</strong><span className="chip chip--plain">{c.status.replaceAll('_',' ')}</span></div><p className="prose-text">{c.detail}</p>
        {c.amount_kes&&<p>Additional fee: <strong>{kes(c.amount_kes)}</strong> · 60% deposit, balance before this engagement’s report.</p>}
        {c.proposed_date&&<p>Proposed date: {fmtDate(c.proposed_date)}</p>}<p className="hint">Response due {fmtDate(c.due_on)} · {c.kind==='cancellation'?'Admin':c.owner_name??'Team'}</p>
        {c.proposed_terms&&<p className="prose-text"><strong>Proposed settlement:</strong> {c.proposed_terms}</p>}
        {c.client_response&&<p className="prose-text"><strong>Client response:</strong> {c.client_response}</p>}
        {c.resolution&&<p className="prose-text"><strong>Resolution:</strong> {c.resolution}</p>}
        {!manager&&c.status==='awaiting_client'&&['scope_change','cancellation'].includes(c.kind)&&<form action={workflowAction} className="space-y-3">{hidden('respond')}<input type="hidden" name="caseId" value={c.id}/><label className="label">Your response<input className="input" name="note" minLength={5} required/></label><label className="check"><input type="checkbox" name="agree" required/>I reviewed the exact scope, fee, date or settlement shown above.</label><div className="flex gap-3"><button className="btn btn-primary btn-small" name="decision" value="accept">Accept terms</button><button className="btn btn-secondary btn-small" name="decision" value="decline">Decline</button></div></form>}
        {manager&&['open','accepted'].includes(c.status)&&c.kind!=='scope_change'&&(c.kind!=='cancellation'||admin)&&<form action={workflowAction} className="space-y-3">{hidden('respond')}<input type="hidden" name="caseId" value={c.id}/><label className="label">{c.kind==='cancellation'?'Settlement: work delivered, charges retained, refund due and arrangements':'Resolution'}<textarea className="input" name="note" minLength={5} required/></label><button className="btn btn-secondary btn-small" name="decision" value={c.kind==='cancellation'&&c.status!=='accepted'?'propose':'resolve'}>{c.kind==='cancellation'&&c.status!=='accepted'?'Send settlement for acceptance':'Mark resolved'}</button></form>}
        {manager&&c.kind==='scope_change'&&c.status==='accepted'&&<p className="hint">An admin can now issue the exact accepted fee under Payments.</p>}
      </article>)}
      <details><summary className="cursor-pointer">{manager?'Create a tracked request':'Ask for clarification or report an issue'}</summary>
        <form action={workflowAction} className="space-y-3 mt-3">{hidden('case')}<label className="label">Request type<select className="input" name="kind"><option value="clarification">Clarification</option><option value="complaint">Report an issue</option>{admin&&<option value="scope_change">Additional scope for client approval</option>}</select></label><label className="label">Details, scope and delivery changes<textarea className="input" name="detail" minLength={10} maxLength={6000} required/></label>
          {admin&&<><label className="label">Additional fee, KES (scope changes only)<input className="input" type="number" name="amount" min="1" max="100000000"/></label><label className="label">Proposed report date (scope changes only)<input className="input" type="date" name="date"/></label></>}
          <button className="btn btn-primary btn-small">Send request</button></form>
      </details>
    </details>
  </div>
}
