import type { ProjectStage, RequestStatus, Role } from './labels'

export function fieldworkProblem(p: { onboarding_submitted_at: unknown; data_consent_at: unknown; payment_status: string; lead_analyst_id: string | null; nda_status?: string }, agentId: string | null) {
  if (!p.onboarding_submitted_at || !p.data_consent_at) return 'The client must complete onboarding and consent before fieldwork.'
  if (!['deposit_received', 'paid', 'waived'].includes(p.payment_status)) return 'Record the required payment or an authorised waiver before fieldwork.'
  if (p.nda_status && !['none', 'signed'].includes(p.nda_status)) return 'The requested confidentiality agreement must be signed before fieldwork.'
  if (!p.lead_analyst_id || !agentId) return 'Assign a lead analyst and field agent before fieldwork.'
  return null
}

export function fieldCollectionProblem(
  p: Parameters<typeof fieldworkProblem>[0] & { stage: string },
  inspection: { status: string; agent_id: string | null },
) {
  if (!['scheduled', 'in_progress'].includes(inspection.status)) return 'Reopen the inspection before changing fieldwork.'
  if (p.stage === 'closed') return 'The project is closed.'
  return fieldworkProblem(p, inspection.agent_id)
}

export type NextStep = { title: string; text: string; tab: 'overview' | 'inspections' | 'evidence' | 'reports' | 'messages' | 'operations' | 'agreement' }

/**
 * The single most useful thing staff can do next on a project, shown at the top of the project page.
 * `unpaidBalanceKes` is money still owed on issued invoices after the deposit (0 when settled).
 */
export function staffNextStep(
  p: { stage: ProjectStage; onboarding_submitted_at: unknown; data_consent_at: unknown; payment_status: string; lead_analyst_id: string | null; field_agent_id: string | null; nda_status?: string },
  inspections: { status: string }[],
  reports: { status: string }[],
  flaggedEvidence: number,
  unpaidBalanceKes = 0,
): NextStep | null {
  if (p.stage === 'closed') return null
  const live = inspections.filter((i) => i.status !== 'cancelled')
  if (live.length === 0 || (['planning','onboarding'].includes(p.stage) && reports.some(r => r.status==='published') && live.every(i => i.status==='reviewed'))) {
    if (!p.onboarding_submitted_at || !p.data_consent_at) return { title: 'Waiting for client onboarding', text: 'The client must complete onboarding and consent before fieldwork. Send a reminder if it is taking long.', tab: 'messages' }
    if (!p.lead_analyst_id || !p.field_agent_id) return { title: 'Assign the team', text: 'Choose a lead analyst and a field agent before scheduling the visit.', tab: 'overview' }
    if (!['deposit_received', 'paid', 'waived'].includes(p.payment_status)) return { title: 'Record the payment', text: 'Fieldwork can start once the required payment or an authorised waiver is recorded.', tab: 'operations' }
    if (p.nda_status && !['none', 'signed'].includes(p.nda_status)) return { title: 'Complete the confidentiality agreement', text: 'The client requested an NDA before work starts. Prepare it and ask them to sign.', tab: 'agreement' }
    return { title: 'Schedule the site visit', text: 'Everything is in place. Create the inspection and set a date.', tab: 'inspections' }
  }
  if (live.some(i => ['scheduled','in_progress'].includes(i.status))) {
    const problem = fieldworkProblem(p,p.field_agent_id)
    if (problem) return { title:'Visit preparation is incomplete',text:problem,tab:!p.onboarding_submitted_at || !p.data_consent_at ? 'messages' : !['deposit_received','paid','waived'].includes(p.payment_status) ? 'operations' : p.nda_status && !['none','signed'].includes(p.nda_status) ? 'agreement' : 'overview' }
  }
  if (live.some((i) => i.status === 'submitted')) return { title: 'Review the submitted inspection', text: 'Findings and evidence are in. An independent reviewer needs to check them before they reach the client.', tab: 'inspections' }
  if (live.some((i) => i.status === 'scheduled' || i.status === 'in_progress')) return { title: 'Fieldwork under way', text: 'The field agent records findings and evidence on the inspection, then submits it for review.', tab: 'inspections' }
  if (flaggedEvidence > 0 && !reports.some(r => r.status === 'published')) return { title: 'Check flagged evidence', text: `${flaggedEvidence} evidence item${flaggedEvidence === 1 ? '' : 's'} held for review. Release usable evidence with a review note before including it in the report.`, tab: 'evidence' }
  if (reports.some((r) => r.status === 'in_review')) return { title: 'Report waiting for review', text: 'Another analyst or admin must approve it before it can be published.', tab: 'reports' }
  if (reports.some((r) => r.status === 'draft')) return { title: 'Finish the draft report', text: 'Complete the draft and send it for review.', tab: 'reports' }
  if (reports.some((r) => r.status === 'published')) {
    if (unpaidBalanceKes > 0) return { title: 'Collect the outstanding balance', text: `KES ${unpaidBalanceKes.toLocaleString('en-US')} is still payable on this project. Record the payment or an authorised waiver before closing it.`, tab: 'operations' }
    if (p.stage === 'monitoring') return { title: 'Monitoring in progress', text: 'Check the plan and the next cycle under Billing.', tab: 'operations' }
    return { title: 'Report delivered', text: 'Follow up with the client, offer monitoring, or close the project when the work is finished.', tab: 'messages' }
  }
  return { title: 'Write the report', text: 'Inspections are reviewed. Start the report from the reviewed findings.', tab: 'reports' }
}

export type ClientNextStep = { title: string; text: string; action?: { label: string; href: string } }

/** What the client needs to know or do next on a project, in plain words. `due` is an unpaid deposit, already formatted; `balance` is the money owed after it, once the report is out. */
export function clientNextStep(
  p: { code: string; stage: ProjectStage; onboarding_submitted_at: unknown; nda_status?: string; data_consent_at?: unknown },
  inspections: { status: string; scheduled_for: string | null }[],
  reports: { id: string; client_viewed_at?: unknown }[],
  due: { amount: string; invoice: string; paymentNotified?: boolean } | null,
  fmtDate: (d: string) => string,
  balance: { amount: string; invoice: string } | null = null,
  reportLocked: { amount: string; invoice: string } | null = null,
): ClientNextStep {
  const base = `/portal/projects/${p.code}`
  if (p.stage === 'closed' && reportLocked) return { title: 'Pay the remaining balance', text: `${reportLocked.amount} is still due for ${reportLocked.invoice}. Your report opens once it is settled.`, action: { label: 'How to pay', href: `${base}?tab=operations` } }
  if (p.stage === 'closed') return { title: 'This project is complete', text: 'Your reports and evidence stay here. If you need another visit, ask for a follow-up.', action: { label: 'Request a follow-up', href: `/estimate?project=${p.code}` } }
  if (!p.onboarding_submitted_at) return { title: 'Tell us about the site', text: 'Where it is, who we should meet and what you have been told. We plan the visit from this.', action: { label: 'Add site details', href: `${base}?tab=onboarding` } }
  if ('data_consent_at' in p && !p.data_consent_at) return { title:'Fieldwork is paused',text:'Your consent is withdrawn. Contact your analyst to discuss what happens next, or review your site details to give consent again.',action:{label:'Contact your analyst',href:`${base}?tab=messages`} }
  if (due?.paymentNotified) return {title:'Confirming your payment',text:`We have your payment reference for invoice ${due.invoice}. The payment team will check the funds and update your balance. No further payment is needed while this is being checked.`}
  if (due) return { title: 'Pay the deposit', text: `We book the site visit once we receive ${due.amount} for invoice ${due.invoice}.`, action: { label: 'How to pay', href: `${base}?tab=operations` } }
  if (balance && (p.stage === 'delivered' || p.stage === 'monitoring')) return { title: 'Pay the remaining balance', text: `${balance.amount} is still due for ${balance.invoice}. Your report opens once it is settled.`, action: { label: 'How to pay', href: `${base}?tab=operations` } }
  if (p.nda_status === 'prepared') return { title: 'Sign your confidentiality agreement', text: 'Your agreement is ready. We will start fieldwork once it is signed.', action: { label: 'Review agreement', href: `${base}?tab=agreement` } }
  if (p.nda_status === 'requested') return { title: 'Preparing your confidentiality agreement', text: 'Your analyst is preparing the NDA you requested. We will ask you to sign it before fieldwork starts.' }
  const open = inspections.filter((i) => ['scheduled', 'in_progress', 'submitted'].includes(i.status))
  if (open.some((i) => i.status === 'in_progress')) return { title: 'We are at the site', text: 'Our field agent is collecting photos, video and GPS evidence. You will see it here once it has been checked.' }
  const visit = open.find((i) => i.status === 'scheduled')
  if (visit) return { title: visit.scheduled_for ? `Site visit on ${fmtDate(visit.scheduled_for)}` : 'We are arranging the visit date', text: 'Our field agent will collect photos, video and GPS evidence. You will see it here once it has been checked.' }
  if (open.length) return { title: 'Checking the evidence', text: 'A second person checks every finding and photo before it reaches you.' }
  const report = reports[0]
  if (report && reportLocked) return { title: 'Your report opens once it is paid', text: `Pay ${reportLocked.amount} for ${reportLocked.invoice} to read the findings and our recommendation.`, action: { label: 'How to pay', href: `${base}?tab=operations` } }
  if (report && !report.client_viewed_at) return { title: 'Your report is ready', text: 'Read the findings and our recommendation. Feedback is optional.', action: { label: 'Read the report', href: `${base}/reports/${report.id}` } }
  if (report) return p.stage === 'monitoring'
    ? { title: 'Ongoing monitoring', text: 'We visit the site on a schedule and update you here after each visit.' }
    : { title: 'Report delivered', text: 'Questions about the findings? Message your analyst, or ask for a follow-up visit.', action: { label: 'Message your analyst', href: `${base}?tab=messages` } }
  if (inspections.some((i) => i.status === 'reviewed')) return { title: 'Writing your report', text: 'Your analyst is writing the report. A second person checks it before it is released.' }
  return { title: 'Planning your visit', text: 'Your analyst is preparing the visit. The date will appear here.' }
}

export type RequestNextStep = { title: string; text: string; action?: 'take' | 'start' | 'proposal' | 'message' | 'project' }

/** The next thing staff should do on a request, shown above the proposal. */
export function staffRequestNextStep(r: { status: RequestStatus; owner_id: string | null }, hasDraft: boolean): RequestNextStep {
  switch (r.status) {
    case 'submitted':
      return r.owner_id
        ? { title: 'New request', text: 'Start the review so the client knows it is being looked at, then write the proposal.', action: 'start' }
        : { title: 'New request', text: 'Take it on so the client knows it is being looked at, then write the proposal.', action: 'take' }
    case 'in_review':
      return hasDraft
        ? { title: 'Finish the proposal', text: 'Check the draft and send it to the client.', action: 'proposal' }
        : { title: 'Write the proposal', text: 'It is pre-filled from the client’s estimate. Check the scope and price, then send it.', action: 'proposal' }
    case 'proposal_sent':
      return { title: 'Waiting for the client', text: 'They can accept or decline online. If you have not heard back in a few days, send them a message.', action: 'message' }
    case 'declined':
      return { title: 'The client declined', text: 'Ask what would work for them and send a revised proposal, or close the request.', action: 'proposal' }
    case 'accepted':
      return { title: 'Accepted', text: 'The work continues on the project.', action: 'project' }
    case 'withdrawn':
      return { title: 'Withdrawn by the client', text: 'Nothing more to do unless they get in touch.' }
    default:
      return { title: 'Closed', text: 'This request is archived.' }
  }
}

export function requestTransitionAllowed(from: RequestStatus, to: RequestStatus) {
  // Contract outcomes are changed only by the proposal workflow.
  return ({ submitted: ['in_review', 'closed'], in_review: ['closed'], proposal_sent: ['closed'], accepted: ['closed'], declined: ['closed'], withdrawn: ['closed'], closed: [] } as Record<RequestStatus, string[]>)[from].includes(to)
}

export const requestStatuses: RequestStatus[] = ['submitted', 'in_review', 'proposal_sent', 'accepted', 'declined', 'withdrawn', 'closed']

/** The statuses staff may set by hand from here. Acceptance, decline and withdrawal come from the client. */
export function requestStatusTargets(from: RequestStatus): RequestStatus[] {
  return requestStatuses.filter((to) => requestTransitionAllowed(from, to))
}

/**
 * Database triggers write a full before/after row for every audited change.
 * Those rows belong in the audit log; the human-facing history shows the
 * explicit decision or communication events instead.
 */
export const TECHNICAL_EVENT_PATTERN =
  '^(projects|requests|proposals|inspections|inspection_checks|findings|files|reports|project_contacts|enquiries|invoices|payments|payment_notices|service_requests|monitoring_cycles|project_alerts|project_sites)\\.(insert|update|delete)$'

const technicalEvent = new RegExp(TECHNICAL_EVENT_PATTERN)

export function isTechnicalAuditEvent(type: string) {
  return technicalEvent.test(type)
}

export function projectTransitionProblem(from: ProjectStage, to: ProjectStage) {
  if (from === to) return null
  if (to === 'closed') return null
  return 'Project stages advance through onboarding, inspections and report publication. Create follow-up work to reopen a closed project.'
}

export function filePermission(user: { id: string; role: Role }, file: { category: string; uploaded_by: string; visible_to_client: boolean; field_access: boolean; inspection_id: string | null }, context: { ownsProject: boolean; assignedInspection: boolean; publishedReport: boolean }) {
  if (user.role === 'admin' || user.role === 'analyst') return true
  if (user.role === 'client') {
    if (!context.ownsProject || file.category === 'internal') return false
    if (file.category === 'report') return context.publishedReport
    return file.visible_to_client || file.uploaded_by === user.id
  }
  if (file.category === 'client_document') return file.field_access
  return file.category === 'evidence' && !!file.inspection_id && context.assignedInspection
}

export function reportContentProblems(r: { executive_summary: string; overall_status: string | null; scope: string; methodology: string; recommendations: string | null; limitations: string }, findings: number, evidence: number) {
  return [
    !r.executive_summary.trim() && 'Add an executive summary.',
    !['ok', 'warn', 'bad'].includes(r.overall_status ?? '') && 'Choose the overall status.',
    !r.scope.trim() && 'Describe the scope.',
    !r.methodology.trim() && 'Describe the methodology.',
    !r.recommendations?.trim() && 'Add recommendations.',
    !r.limitations.trim() && 'State the limitations.',
    findings === 0 && 'Include at least one reviewed finding.',
    evidence === 0 && 'Include at least one reviewed evidence item.',
  ].filter(Boolean) as string[]
}
