import 'server-only'
import { sql, withActor } from '@/lib/db'
import { notifyTeam, notifyUser, logEvent } from '@/lib/activity'

export async function engagementDetails(projectId: string) {
  const [work, cases, visits] = await Promise.all([
    sql`select w.*,p.active_work_order_id,p.data_consent_at,p.onboarding_submitted_at,p.code,p.client_id,p.lead_analyst_id,
      u.full_name approved_by_name from work_orders w join projects p on p.id=w.project_id
      left join users u on u.id=w.brief_approved_by where w.project_id=${projectId} order by w.created_at desc`,
    sql`select c.*,u.full_name owner_name from workflow_cases c left join users u on u.id=c.assigned_to where c.project_id=${projectId} order by c.created_at desc`,
    sql`select id,title,scheduled_for,arrival_window,schedule_version,client_confirmed_at from inspections where project_id=${projectId} and status in ('scheduled','in_progress') order by scheduled_for`,
  ])
  return { work, cases, visits }
}

export async function approveBrief(projectId: string, actorId: string, version: number, requiredSites: number) {
  if (!Number.isInteger(requiredSites) || requiredSites < 1 || requiredSites > 100) throw new Error('Set the number of required sites or work visits (1–100).')
  await withActor(actorId, async tx => {
    const [p] = await tx`select * from projects where id=${projectId} for update`
    if (!p.onboarding_submitted_at || !p.data_consent_at) throw new Error('The client must submit the brief and consent first.')
    const rows = await tx`update work_orders set brief_approved_version=brief_version,brief_approved_at=now(),brief_approved_by=${actorId},
      brief_snapshot=${tx.json(p.service_brief)},required_sites=${requiredSites}
      where id=${p.active_work_order_id} and brief_version=${version} returning id`
    if (!rows.length) throw new Error('The brief changed. Refresh and review it again.')
  })
  await logEvent({actorId,projectId,type:'brief.approved',summary:'The analyst checked the brief against the agreed scope.',clientVisible:true})
}

export async function renewConsent(projectId: string, actorId: string) {
  await withActor(actorId, async tx => {
    const [p] = await tx`select * from projects where id=${projectId} and client_id=${actorId} for update`
    if (!p || p.stage === 'closed') throw new Error('Contact your analyst about reopening this project.')
    if (p.data_consent_at) throw new Error('Consent is already recorded.')
    await tx`update projects set data_consent_at=now() where id=${projectId}`
    await tx`update service_requests set status='completed',resolution='Client explicitly renewed consent; staff must resume the work.',resolved_by=${actorId},resolved_at=now()
      where project_id=${projectId} and kind='consent_withdrawal' and status='requested'`
    await tx`update work_orders set hold_reason='Consent renewed; analyst must review and resume work' where project_id=${projectId} and hold_reason like 'Consent%'`
  })
  await logEvent({actorId,projectId,type:'consent.renewed',summary:'Client renewed consent. Work awaits staff resumption.',clientVisible:true})
  await notifyTeam({title:'Consent renewed: review and resume work',href:`/staff/projects/${(await sql`select code from projects where id=${projectId}`)[0].code}`})
}

export async function resumeWork(projectId: string, actorId: string, reason: string) {
  if (reason.trim().length < 5) throw new Error('Explain why the work can resume.')
  await withActor(actorId, async tx => {
    const [p] = await tx`select * from projects where id=${projectId} for update`
    if (!p.data_consent_at || p.stage==='closed') throw new Error('Active consent and an open project are required.')
    if ((await tx`select 1 from workflow_cases where project_id=${projectId} and kind='cancellation' and status in ('open','awaiting_client','accepted')`).length)
      throw new Error('Resolve the cancellation and settlement before resuming work.')
    await tx`update work_orders set hold_reason=null where project_id=${projectId} and completed_at is null`
  })
  await logEvent({actorId,projectId,type:'work.resumed',summary:`Work resumed: ${reason}`,clientVisible:true})
}

export async function createCase(projectId: string, actorId: string, input: {kind:string;detail:string;amount?:number;date?:string;reportId?:string;inspectionId?:string}) {
  if (!['clarification','complaint','scope_change','reschedule'].includes(input.kind) || input.detail.trim().length < 10) throw new Error('Describe the request in at least 10 characters.')
  return withActor(actorId, async tx => {
    const [p] = await tx`select * from projects where id=${projectId} for update`
    const [actor] = await tx`select role from users where id=${actorId} and disabled_at is null`
    if (!p || !actor || (actor.role==='client' && p.client_id!==actorId)) throw new Error('Project not found.')
    if (input.kind==='scope_change' && actor.role!=='admin') throw new Error('An admin must approve and send additional charges.')
    if (input.kind==='scope_change' && (!Number.isSafeInteger(input.amount) || input.amount!<=0 || input.amount!>1e8 || !input.date)) throw new Error('Enter the additional fee and proposed report date.')
    if (input.reportId && !(await tx`select 1 from reports where id=${input.reportId} and project_id=${projectId} and status='published'`).length) throw new Error('Report not found.')
    if (input.inspectionId && !(await tx`select 1 from inspections where id=${input.inspectionId} and project_id=${projectId} and status in ('scheduled','in_progress')`).length) throw new Error('Visit not found.')
    const [c] = await tx`insert into workflow_cases(project_id,work_order_id,report_id,inspection_id,kind,title,detail,created_by,assigned_to,amount_kes,proposed_date,status)
      values(${projectId},${p.active_work_order_id},${input.reportId??null},${input.inspectionId??null},${input.kind},${input.kind.replaceAll('_',' ')},${input.detail},${actorId},${p.lead_analyst_id},
        ${input.kind==='scope_change'?input.amount!:null},${input.date||null},${input.kind==='scope_change'?'awaiting_client':'open'}) returning id`
    return c.id as string
  })
}

// A client asks the team to reopen a closed project. The request is a complaint case; only an admin reopens.
export const REOPEN_REQUEST = 'Reopen request: '

export async function openReopenRequest(projectId: string) {
  const [row] = await sql<{ id: string; created_at: Date; reason: string }[]>`
    select id, created_at, regexp_replace(detail, '^Reopen request: ', '') as reason from workflow_cases
    where project_id = ${projectId} and kind = 'complaint' and detail like ${REOPEN_REQUEST + '%'} and status in ('open','awaiting_client')
    order by created_at desc limit 1`
  return row ?? null
}

export async function requestReopen(projectId: string, clientId: string, reason: string) {
  const text = reason.trim()
  if (text.length < 10) throw new Error('Tell us in at least 10 characters what still needs attention.')
  const [p] = await sql<{ stage: string }[]>`select stage from projects where id = ${projectId}`
  if (!p || p.stage !== 'closed') throw new Error('Only a closed project can be reopened.')
  if (await openReopenRequest(projectId)) throw new Error('You have already asked us to reopen this project. Our team will reply soon.')
  const id = await createCase(projectId, clientId, { kind: 'complaint', detail: REOPEN_REQUEST + text })
  await withActor(clientId, async tx => tx`update workflow_cases set title = 'Reopen requested by client' where id = ${id}`)
}

export async function respondCase(projectId:string,caseId:string,actorId:string,decision:string,note:string) {
  if(note.trim().length<5) throw new Error('Add a response of at least five characters.')
  await withActor(actorId,async tx=>{
    const [p]=await tx`select * from projects where id=${projectId} for update`
    const [c]=await tx`select * from workflow_cases where id=${caseId} and project_id=${projectId} for update`
    const [actor]=await tx`select role from users where id=${actorId} and disabled_at is null`
    if(!c||!actor||!['open','awaiting_client','accepted'].includes(c.status))throw new Error('This request is no longer open.')
    if(actor.role==='client') {
      if(p.client_id!==actorId||c.status!=='awaiting_client'||!['scope_change','cancellation'].includes(c.kind))throw new Error('This decision is not available.')
      if(!['accept','decline'].includes(decision))throw new Error('Accept or decline the displayed terms.')
      await tx`update workflow_cases set status=${decision==='accept'?'accepted':'declined'},accepted_by=${actorId},accepted_at=now(),client_response=${note} where id=${caseId}`
      if(c.kind==='cancellation'&&decision==='decline')await tx`update service_requests set status='declined',resolution='Client declined the proposed settlement. Work remains on hold pending discussion.',resolved_at=now(),resolved_by=${actorId} where project_id=${projectId} and kind='cancellation' and status='requested'`
    } else {
      if(!['admin','analyst'].includes(actor.role))throw new Error('Not allowed.')
      if(c.kind==='scope_change')throw new Error('The client accepts charges; an admin issues the accepted invoice.')
      if(c.kind==='cancellation') {
        if(actor.role!=='admin')throw new Error('An admin must complete the financial settlement.')
        if(decision==='resolve') {
          if(c.status!=='accepted')throw new Error('The client must accept the settlement first.')
          if((await tx`select 1 from invoices i where project_id=${projectId} and status='issued' and amount_kes<>coalesce((select sum(case when kind='payment' then amount_kes else -amount_kes end) from payments where invoice_id=i.id),0)`).length)
            throw new Error('Reconcile every charge, credit and refund before closing the cancellation.')
          if((await tx`select 1 from inspections where project_id=${projectId} and status='submitted'`).length || (await tx`select 1 from reports where project_id=${projectId} and status in ('draft','in_review')`).length)
            throw new Error('Resolve submitted visits and unfinished reports before closing the project.')
          await tx`update inspections set status='cancelled' where project_id=${projectId} and status in ('scheduled','in_progress')`
          await tx`update projects set stage='closed',closed_at=now(),monitoring_status='cancelled' where id=${projectId}`
          await tx`update service_requests set status='completed',resolution=${note},resolved_at=now(),resolved_by=${actorId} where project_id=${projectId} and kind='cancellation' and status='requested'`
        } else if(decision==='propose') {
          await tx`update workflow_cases set status='awaiting_client',proposed_terms=${note} where id=${caseId}`
          return
        } else throw new Error('Propose the settlement or complete an accepted settlement.')
      }
      if(!['resolve','decline'].includes(decision))throw new Error('Choose a resolution.')
      await tx`update workflow_cases set status=${decision==='resolve'?'resolved':'declined'},resolution=${note},resolved_by=${actorId},resolved_at=now() where id=${caseId}`
    }
  })
}

export async function sendWorkflowReminders() {
  const rows=await sql`update workflow_cases set reminder_at=now() where id in
    (select id from workflow_cases where status in ('open','awaiting_client','accepted') and due_on<=current_date
      and (reminder_at is null or reminder_at<now()-interval '1 day') order by due_on limit 30 for update skip locked)
    returning *`
  for(const c of rows) {
    const [p]=await sql`select code,client_id from projects where id=${c.project_id}`
    if(c.status==='awaiting_client')await notifyUser(p.client_id,{title:`Response requested: ${c.title}`,href:`/portal/projects/${p.code}?tab=settings`})
    else await notifyTeam({title:`Overdue: ${c.title}`,body:c.detail,href:`/staff/projects/${p.code}?tab=settings`,staffIds:c.assigned_to?[c.assigned_to]:undefined})
  }
  return rows.length
}

export async function settleCancellationInvoice(projectId:string,actorId:string,invoiceId:string,retained:number,reason:string) {
  if(!Number.isSafeInteger(retained)||retained<0||reason.trim().length<5)throw new Error('Enter a non-negative retained charge and settlement reason.')
  await withActor(actorId,async tx=>{
    if(!(await tx`select 1 from users where id=${actorId} and role='admin' and disabled_at is null`).length)throw new Error('Only admins settle invoices.')
    if(!(await tx`select 1 from workflow_cases where project_id=${projectId} and kind='cancellation' and status='accepted'`).length)throw new Error('The client must accept the cancellation settlement first.')
    const [i]=await tx`select * from invoices where id=${invoiceId} and project_id=${projectId} and status='issued' for update`
    if(!i||retained>i.amount_kes)throw new Error('Settlement cannot increase the charge.')
    await tx`update invoices set amount_kes=${retained},deposit_kes=${Math.round(retained*.6)},line_items=${tx.json([{label:'Retained charge under accepted cancellation',amount:retained}])},revision=revision+1,revision_reason=${reason},revised_at=now() where id=${invoiceId}`
  })
}
