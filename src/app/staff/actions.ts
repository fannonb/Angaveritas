'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { logEvent, notifyTeam, notifyUser } from '@/lib/activity'
import { requestIpHash, requireStaff, type SessionUser } from '@/lib/auth/session'
import { issueToken } from '@/lib/auth/tokens'
import { sql, withActor } from '@/lib/db'
import { deleteFileRow, getFile, updateFileMeta, uploadWriteProblem } from '@/lib/data/files'
import {
  addFinding,
  createInspection,
  deleteFinding,
  getInspection,
  saveFieldNotes,
  setInspectionStatus,
  updateFinding,
  updateInspectionPlan,
} from '@/lib/data/inspections'
import { postMessage } from '@/lib/data/messages'
import { reportLock, unpaidInvoices } from '@/lib/data/operations'
import { setEnquiryStatus } from '@/lib/data/misc'
import { getActivePricing, getPricingVersion, savePricingVersion } from '@/lib/data/pricing'
import { setSiteSetting } from '@/lib/data/settings'
import { addContact, assignProjectTeam, projectFor, removeContact, setProjectStage, updateProjectStaff, type ProjectAccess } from '@/lib/data/projects'
import { deleteDraft, getProposal, saveDraft, sendProposal, type LineItem } from '@/lib/data/proposals'
import { createReport, getReport, setReportStatus, updateReport, publishReport, withdrawReport, validateReportInspection } from '@/lib/data/reports'
import { fieldCollectionProblem, fieldworkProblem, requestTransitionAllowed, projectTransitionProblem } from '@/lib/workflow'
import { getRequestById, setRequestStatus, updateQualification } from '@/lib/data/requests'
import { countAdmins, createStaffAccount, findUserByEmail, getUserById, setDisabled, setStaffRole } from '@/lib/data/users'
import { appUrl, sendEmail } from '@/lib/email'
import {
  confidenceLabels,
  healthLabels,
  projectStages,
  requestStatusLabels,
  stageLabels,
  staffRoles,
  type Confidence,
  type FindingStatus,
  type Health,
  type ProjectStage,
  type RequestStatus,
  type Role,
} from '@/lib/labels'
import { configProblems, pricingConfigSchema, type PricingConfig } from '@/lib/pricing/config'
import { site } from '@/lib/site'
import { fmtDate } from '@/components/app/format'
import { deleteObject } from '@/lib/storage'
import { emailSchema, formText, lines } from '@/lib/validation'

export type StaffState = { error?: string; ok?: boolean; message?: string; errors?: string[] } | null

const managers: Role[] = ['analyst', 'admin']
const str = (form: FormData, k: string) => String(form.get(k) ?? '')
const dateOrNull = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

async function managedProject(form: FormData, user: SessionUser): Promise<ProjectAccess> {
  const access = await projectFor(user, str(form, 'projectId'))
  if (!access || !access.canManage) throw new Error('Not allowed.')
  return access
}

function refreshProject(code: string) {
  revalidatePath(`/staff/projects/${code}`)
  revalidatePath(`/portal/projects/${code}`)
}

// =====================================================================
// Requests and proposals (stages 2–3)
// =====================================================================

export async function requestStatusAction(form: FormData) {
  const user = await requireStaff(managers)
  const r = await getRequestById(str(form, 'requestId'))
  const status = str(form, 'status') as RequestStatus
  if (!r || !(status in requestStatusLabels) || r.status === status) return
  if (!requestTransitionAllowed(r.status, status)) return
  await setRequestStatus(r.id, status)
  await logEvent({ actorId: user.id, requestId: r.id, type: 'request.status', summary: `Status: ${requestStatusLabels[status]}`, clientVisible: status === 'in_review' || status === 'closed' })
  if (status === 'closed' && r.status !== 'accepted' && r.status !== 'declined') {
    await notifyUser(r.client_id, { title: `Request ${r.reference} closed`, body: 'We have closed this request. Message us if you would like to reopen the conversation.', href: `/portal/requests/${r.reference}` })
  }
  revalidatePath(`/staff/requests/${r.reference}`)
  revalidatePath('/staff/requests')
  revalidatePath(`/portal/requests/${r.reference}`)
}

/** Lets an analyst or admin take a request in one step. Taking a new request also starts its review, so the client hears someone is on it. */
export async function claimRequestAction(form: FormData) {
  const user = await requireStaff(managers)
  const r = await getRequestById(str(form, 'requestId'))
  if (!r) return
  if (r.owner_id !== user.id) {
    await updateQualification(r.id, { priority: r.priority, ownerId: user.id })
    await logEvent({ actorId: user.id, requestId: r.id, type: 'request.assigned', summary: `${user.full_name} took ownership of this request` })
  }
  if (r.status === 'submitted') {
    await setRequestStatus(r.id, 'in_review')
    await logEvent({ actorId: user.id, requestId: r.id, type: 'request.status', summary: 'An analyst is reviewing your request', clientVisible: true })
  }
  revalidatePath(`/staff/requests/${r.reference}`)
  revalidatePath('/staff/requests')
  revalidatePath(`/portal/requests/${r.reference}`)
}

export async function qualifyAction(form: FormData) {
  const user = await requireStaff(managers)
  const r = await getRequestById(str(form, 'requestId'))
  if (!r) return
  const priority = ['high', 'normal', 'low'].includes(str(form, 'priority')) ? (str(form, 'priority') as 'high') : null
  const ownerId = /^[0-9a-f-]{36}$/.test(str(form, 'ownerId')) ? str(form, 'ownerId') : null
  await updateQualification(r.id, { priority, ownerId })
  if (r.status === 'submitted') {
    await setRequestStatus(r.id, 'in_review')
    await logEvent({ actorId: user.id, requestId: r.id, type: 'request.status', summary: 'An analyst is reviewing your request', clientVisible: true })
  }
  await logEvent({ actorId: user.id, requestId: r.id, type: 'request.qualified', summary: `Qualified: priority ${priority ?? 'unset'}` })
  if (ownerId && ownerId !== r.owner_id && ownerId !== user.id) {
    await notifyUser(ownerId, { title: `You own ${r.reference}: ${r.title}`, href: `/staff/requests/${r.reference}`, email: false })
  }
  revalidatePath(`/staff/requests/${r.reference}`)
}

function lineItemsFromForm(form: FormData): LineItem[] {
  const labels = form.getAll('li_label').map(String)
  const details = form.getAll('li_detail').map(String)
  const amounts = form.getAll('li_amount').map((a) => Number(String(a).replace(/[, ]/g, '')))
  return labels
    .map((label, i) => ({ label: label.trim().slice(0, 200), detail: details[i]?.trim().slice(0, 200) || undefined, amount: Math.round(amounts[i]) }))
    .filter((l) => l.label && Number.isFinite(l.amount))
}

export async function saveProposalAction(_: StaffState, form: FormData): Promise<StaffState> {
  const user = await requireStaff(managers)
  const r = await getRequestById(str(form, 'requestId'))
  if (!r) return { error: 'Request not found.' }
  if (!['submitted','in_review','proposal_sent','declined'].includes(r.status)) return {error:'This request is no longer open for proposals. Create follow-up work instead.'}
  const items = lineItemsFromForm(form)
  const title = formText(form, 'title', 200)
  const objectives = formText(form, 'objectives', 4000)
  const timeline = formText(form, 'timeline', 500)
  const paymentTerms = formText(form, 'paymentTerms', 1000)
  const deposit = formText(form,'depositKes',20)
  const depositKes = deposit === null ? null : Number(deposit)
  const problems = [
    !title && 'Add a title.',
    !objectives && 'Say what the engagement will answer.',
    !timeline && 'Add the timeline.',
    !paymentTerms && 'Add payment terms.',
    items.length === 0 && 'Add at least one price line.',
    items.reduce((s, i) => s + i.amount, 0) <= 0 && 'The total must be above zero.',
    depositKes !== null && (!Number.isSafeInteger(depositKes) || depositKes < 0 || depositKes > items.reduce((s,i) => s+i.amount,0)) && 'The required deposit must be between zero and the proposal total.',
  ].filter(Boolean) as string[]
  if (problems.length) return { errors: problems }
  try {
    const id = await saveDraft(
      r.id,
      {
        title: title!,
        objectives: objectives!,
        scopeItems: lines(form.get('scope')),
        deliverables: lines(form.get('deliverables')),
        exclusions: formText(form, 'exclusions', 2000),
        timeline: timeline!,
        lineItems: items,
        paymentTerms: paymentTerms!,
        validUntil: dateOrNull(formText(form, 'validUntil', 10)),
        termsVersion: site.termsVersion,
        ndaOffered: form.get('ndaOffered') === 'on',
        depositKes,
      },
      user.id,
      str(form, 'draftId') || undefined,
    )
    await logEvent({ actorId: user.id, requestId: r.id, type: 'proposal.draft_saved', summary: 'Proposal draft saved' })
    if (form.get('intent') === 'send') {
      const p = await sendProposal(id)
      // The person who puts a price in front of the client is the person who
      // owns the relationship, even if nobody got round to setting an owner.
      if (!r.owner_id) {
        await updateQualification(r.id, { priority: r.priority, ownerId: user.id })
        await logEvent({ actorId: user.id, requestId: r.id, type: 'request.assigned', summary: `${user.full_name} took ownership when the proposal was sent` })
      }
      await logEvent({ actorId: user.id, requestId: r.id, type: 'proposal.sent', summary: `Proposal v${p.version} sent: ${p.total_kes.toLocaleString('en-US')} KES`, clientVisible: true })
      if (r.owner_id && r.owner_id !== user.id)
        await notifyUser(r.owner_id, { title: `Proposal sent for ${r.reference}`, body: `${user.full_name} sent v${p.version} (KES ${p.total_kes.toLocaleString('en-US')}). Awaiting the client's decision.`, href: `/staff/requests/${r.reference}`, email: false })
      await notifyUser(r.client_id, {
        title: `Your proposal for ${r.title} is ready`,
        body: `We've prepared a proposal for ${r.reference}: scope, timeline and a total of KES ${p.total_kes.toLocaleString('en-US')}. You can review and accept it online.`,
        href: `/portal/requests/${r.reference}`,
      })
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not save.' }
  }
  revalidatePath(`/staff/requests/${r.reference}`)
  revalidatePath(`/portal/requests/${r.reference}`)
  return { ok: true, message: form.get('intent') === 'send' ? 'Proposal sent to the client.' : 'Draft saved.' }
}

export async function deleteDraftAction(form: FormData) {
  await requireStaff(managers)
  const p = await getProposal(str(form, 'proposalId'))
  if (!p) return
  await deleteDraft(p.id)
  const r = await getRequestById(p.request_id)
  revalidatePath(`/staff/requests/${r?.reference}`)
}

// =====================================================================
// Messages
// =====================================================================

export async function staffMessageAction(form: FormData) {
  const user = await requireStaff(managers)
  const body = str(form, 'body').trim().slice(0, 8000)
  if (!body) return
  const internal = form.get('internal') === 'on'
  const projectId = str(form, 'projectId')
  const requestId = str(form, 'requestId')
  if (projectId) {
    const access = await projectFor(user, projectId)
    if (!access) return
    await postMessage({ projectId }, user.id, body, internal)
    if (!internal) await notifyUser(access.project.client_id, { title: `New message about ${access.project.title}`, body, href: `/portal/projects/${access.project.code}?tab=messages` })
    refreshProject(access.project.code)
  } else if (requestId) {
    const r = await getRequestById(requestId)
    if (!r) return
    await postMessage({ requestId }, user.id, body, internal)
    if (!internal) await notifyUser(r.client_id, { title: `New message about ${r.title}`, body, href: `/portal/requests/${r.reference}#messages` })
    revalidatePath(`/staff/requests/${r.reference}`)
    revalidatePath(`/portal/requests/${r.reference}`)
  }
}

// =====================================================================
// Projects (stages 4–10)
// =====================================================================

export async function updateProjectAction(_: StaffState, form: FormData): Promise<StaffState> {
  const user = await requireStaff(managers)
  let access
  try {
    access = await managedProject(form, user)
  } catch {
    return { error: 'Not allowed.' }
  }
  const p = access.project
  const stage = str(form, 'stage') as ProjectStage
  const health = str(form, 'health') as Health
  if (!projectStages.includes(stage) || !(health in healthLabels)) return { error: 'Invalid stage or health.' }
  const stageProblem = projectTransitionProblem(p.stage, stage)
  if (stageProblem) return { error: stageProblem }
  const lat = formText(form, 'lat', 20)
  const lng = formText(form, 'lng', 20)
  const latN = lat ? Number(lat) : null
  const lngN = lng ? Number(lng) : null
  if ((latN !== null && !Number.isFinite(latN)) || (lngN !== null && !Number.isFinite(lngN))) return { error: 'Coordinates must be numbers.' }
  const title = formText(form, 'title', 140)
  if (!title) return { error: 'Title is required.' }
  if (str(form,'paymentStatus') !== p.payment_status && !formText(form,'paymentNote',1000)) return {error:'Record a payment reference or waiver reason when changing payment status.'}
  if (stage === 'closed' && p.stage !== 'closed' && form.get('closeWithBalance') !== 'on' && str(form,'paymentStatus') !== 'waived') {
    const owed = (await unpaidInvoices(p.id)).reduce((s, u) => s + u.unpaid_kes, 0)
    if (owed > 0) return {error:`KES ${owed.toLocaleString('en-US')} is still unpaid on this project. Record the payment, cancel the invoice, or tick the box to close it anyway.`}
  }
  if (latN !== null && (latN < -90 || latN > 90) || lngN !== null && (lngN < -180 || lngN > 180)) return {error:'Coordinates are outside the valid range.'}
  let prev
  try { prev = await updateProjectStaff(p.id, {
    title,
    stage,
    health,
    healthNote: formText(form, 'healthNote', 1000),
    engagement: str(form, 'engagement') === 'retainer' ? 'retainer' : 'one_off',
    // Team assignments live in their own form so saving the details cannot
    // silently overwrite an assignment made by someone else.
    leadAnalystId: p.lead_analyst_id,
    fieldAgentId: p.field_agent_id,
    startDate: dateOrNull(formText(form, 'startDate', 10)),
    dueDate: dateOrNull(formText(form, 'dueDate', 10)),
    paymentStatus: ['awaiting_payment', 'deposit_received', 'paid', 'waived'].includes(str(form, 'paymentStatus')) ? str(form, 'paymentStatus') : p.payment_status,
    planningNotes: formText(form, 'planningNotes', 8000),
    locationLabel: formText(form, 'locationLabel', 200),
    county: formText(form, 'county', 80),
    lat: latN,
    lng: lngN,
  }, user.id) } catch (e) { return {error:e instanceof Error ? e.message : 'Could not save project.'} }

  // Tell the client about the changes that matter to them.
  if (prev.stage !== stage) {
    await logEvent({ actorId: user.id, projectId: p.id, type: 'project.stage', summary: `Stage: ${stageLabels[stage]}`, clientVisible: true })
    await notifyUser(p.client_id, { title: `${p.title}: ${stageLabels[stage]}`, href: `/portal/projects/${p.code}`, email: stage === 'fieldwork' || stage === 'delivered' })
  }
  if (prev.health !== health) {
    await logEvent({ actorId: user.id, projectId: p.id, type: 'project.health', summary: `Project health: ${healthLabels[health]}${formText(form, 'healthNote', 1000) ? ` (${formText(form, 'healthNote', 1000)})` : ''}`, clientVisible: true })
    if (health === 'high_risk' || health === 'at_risk')
      await notifyUser(p.client_id, { title: `Risk alert: ${p.title} is ${healthLabels[health].toLowerCase()}`, body: formText(form, 'healthNote', 1000) ?? 'Your analyst will explain in a message.', href: `/portal/projects/${p.code}` })
  }
  if (prev.payment_status !== str(form, 'paymentStatus')) {
    await logEvent({ actorId: user.id, projectId: p.id, type: 'project.payment', summary: `Payment: ${str(form, 'paymentStatus').replace('_', ' ')}`, clientVisible: true, data:{note:formText(form,'paymentNote',1000)}, ipHash:await requestIpHash() })
  }
  await logEvent({ actorId: user.id, projectId: p.id, type: 'project.updated', summary: 'Project details updated' })
  refreshProject(p.code)
  return { ok: true, message: 'Saved.' }
}

/**
 * Team assignment is its own action so it is a deliberate hand-off, not a
 * side effect of saving the project details. Moving the field agent also
 * moves open visits assigned to the previous agent or left unassigned.
 */
export async function assignProjectTeamAction(_: StaffState, form: FormData): Promise<StaffState> {
  const user = await requireStaff(managers)
  let access
  try {
    access = await managedProject(form, user)
  } catch {
    return { error: 'Not allowed.' }
  }
  const p = access.project
  const idOrNull = (v: string) => (/^[0-9a-f-]{36}$/.test(v) ? v : null)
  const leadId = idOrNull(str(form, 'leadAnalystId'))
  const fieldId = idOrNull(str(form, 'fieldAgentId'))
  const lead = leadId ? await getUserById(leadId) : null
  if (leadId && (!lead || lead.disabled_at || lead.role === 'client' || lead.role === 'field_agent'))
    return { error: 'Choose an active analyst or admin as the lead analyst.' }
  const field = fieldId ? await getUserById(fieldId) : null
  if (fieldId && (!field || field.disabled_at || field.role === 'client'))
    return { error: 'Choose an active staff member as the field agent.' }

  let result
  try {
    result = await assignProjectTeam(p.id, { leadAnalystId: leadId, fieldAgentId: fieldId }, user.id)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not save the team.' }
  }

  if (result.prev.lead_analyst_id !== leadId) {
    await logEvent({ actorId: user.id, projectId: p.id, type: 'project.assigned', summary: lead ? `Lead analyst: ${lead.full_name}` : 'Lead analyst unassigned', clientVisible: !!lead })
    if (lead && lead.id !== user.id) await notifyUser(lead.id, { title: `You are lead analyst on ${p.code}: ${p.title}`, href: `/staff/projects/${p.code}` })
  }
  if (result.prev.field_agent_id !== fieldId) {
    await logEvent({ actorId: user.id, projectId: p.id, type: 'project.assigned', summary: field ? `Field agent: ${field.full_name}${result.moved.length ? ` (${result.moved.length} open visit${result.moved.length === 1 ? '' : 's'} moved)` : ''}` : 'Field agent unassigned' })
    if (field && field.id !== user.id)
      await notifyUser(field.id, {
        title: `You are assigned to ${p.code}: ${p.title}`,
        body: result.moved.length ? `${result.moved.length} open site visit${result.moved.length === 1 ? ' is' : 's are'} now yours.` : undefined,
        href: `/staff/projects/${p.code}`,
      })
    if (result.prev.field_agent_id && result.prev.field_agent_id !== fieldId)
      await notifyUser(result.prev.field_agent_id, { title: `You are no longer the field agent on ${p.code}`, href: '/staff/projects', email: false })
  }
  refreshProject(p.code)
  return {
    ok: true,
    message: result.moved.length
      ? `Team saved. ${result.moved.length} open visit${result.moved.length === 1 ? '' : 's'} moved to ${field?.full_name ?? 'the new agent'}.`
      : 'Team saved.',
  }
}

export async function staffAddContactAction(form: FormData) {
  const user = await requireStaff()
  const access = await projectFor(user, str(form, 'projectId'))
  if (!access?.canFieldwork) return
  const name = formText(form, 'name', 120)
  if (!name) return
  await addContact(access.project.id, { name, role: formText(form, 'role', 120), phone: formText(form, 'phone', 40), email: formText(form, 'email', 160), notes: formText(form, 'notes', 1000), mayContact: true }, user.id)
  refreshProject(access.project.code)
}

export async function staffRemoveContactAction(form: FormData) {
  const user = await requireStaff(managers)
  const access = await managedProject(form, user)
  await removeContact(access.project.id, str(form, 'contactId'))
  refreshProject(access.project.code)
}

// ---------- Inspections ----------

export async function createInspectionAction(form: FormData) {
  const user = await requireStaff(managers)
  const access = await managedProject(form, user)
  const p = access.project
  const title = formText(form, 'title', 200) ?? 'Site inspection'
  const scheduledFor = dateOrNull(formText(form, 'scheduledFor', 10))
  const agentId = /^[0-9a-f-]{36}$/.test(str(form, 'agentId')) ? str(form, 'agentId') : p.field_agent_id
  const problem = fieldworkProblem(p, agentId)
  if (problem) redirect(`/staff/projects/${p.code}?tab=inspections&error=${encodeURIComponent(problem)}`)
  // The client's claims become the starting checklist for the field team.
  const objectives = formText(form, 'objectives', 8000) ?? (p.claims ? `Verify:\n${p.claims}` : null)
  const siteId = /^[0-9a-f-]{36}$/i.test(str(form,'siteId')) ? str(form,'siteId') : null
  const insp = await createInspection(p.id, { title, scheduledFor, agentId, objectives,siteId }, user.id)
  await logEvent({ actorId: user.id, projectId: p.id, type: 'inspection.scheduled', summary: `Site visit ${insp.code} scheduled${scheduledFor ? ` for ${scheduledFor}` : ''}`, clientVisible: true })
  if (scheduledFor) await notifyUser(p.client_id, { title: `Site visit scheduled: ${p.title}`, body: `Our field team will visit on ${scheduledFor}.`, href: `/portal/projects/${p.code}?tab=inspections` })
  if (agentId) await notifyUser(agentId, { title: `New inspection ${insp.code}: ${p.title}`, body: scheduledFor ? `Scheduled for ${scheduledFor}.` : undefined, href: `/staff/inspections/${insp.id}` })
  refreshProject(p.code)
  redirect(`/staff/inspections/${insp.id}`)
}

async function inspectionAccess(form: FormData, user: SessionUser) {
  const insp = await getInspection(str(form, 'inspectionId'))
  if (!insp) throw new Error('Inspection not found.')
  const access = await projectFor(user, insp.project_id)
  if (!access?.canFieldwork) throw new Error('Not allowed.')
  if (user.role === 'field_agent' && insp.agent_id !== user.id && !(insp.agent_id === null && access.project.field_agent_id === user.id)) throw new Error('Not allowed.')
  return { insp, access }
}

async function editableInspection(form: FormData, user: SessionUser) {
  const result = await inspectionAccess(form, user)
  const problem = fieldCollectionProblem(result.access.project, result.insp)
  if (problem) redirect(`/staff/inspections/${result.insp.id}?error=${encodeURIComponent(problem)}`)
  return result
}

export async function updateInspectionPlanAction(form: FormData) {
  const user = await requireStaff(managers)
  const { insp, access } = await inspectionAccess(form, user)
  if (!['scheduled','in_progress'].includes(insp.status)) redirect(`/staff/inspections/${insp.id}?error=${encodeURIComponent('Reopen the inspection before changing its plan.')}`)
  const scheduledFor = dateOrNull(formText(form, 'scheduledFor', 10))
  const agentId = /^[0-9a-f-]{36}$/.test(str(form, 'agentId')) ? str(form, 'agentId') : null
  await updateInspectionPlan(insp.id, { title: formText(form, 'title', 200) ?? insp.title, scheduledFor, agentId, objectives: formText(form, 'objectives', 8000) })
  if (scheduledFor && scheduledFor !== insp.scheduled_for) {
    await logEvent({ actorId: user.id, projectId: insp.project_id, type: 'inspection.rescheduled', summary: `Site visit ${insp.code} scheduled for ${fmtDate(scheduledFor)}`, clientVisible: true })
    await notifyUser(access.project.client_id, { title: `Site visit date: ${scheduledFor}`, body: `${access.project.title}: ${insp.title}`, href: `/portal/projects/${access.project.code}?tab=inspections` })
  }
  if (agentId && agentId !== insp.agent_id) await notifyUser(agentId, { title: `Inspection ${insp.code} assigned to you`, href: `/staff/inspections/${insp.id}` })
  revalidatePath(`/staff/inspections/${insp.id}`)
  refreshProject(access.project.code)
}

export async function inspectionStatusAction(form: FormData) {
  const user = await requireStaff()
  const { insp, access } = await inspectionAccess(form, user)
  const to = str(form, 'to')
  const p = access.project
  const allowed: Record<string, string[]> = {
    in_progress: ['scheduled'],
    submitted: ['scheduled', 'in_progress'],
    reviewed: ['submitted'],
    cancelled: ['scheduled', 'in_progress'],
    scheduled: ['cancelled'], // Submitted work reopens through a correction request.
  }
  if (!allowed[to]?.includes(insp.status)) return
  if ((to === 'reviewed' || to === 'cancelled' || to === 'scheduled') && !access.canManage) return
  const problem = fieldworkProblem(p, insp.agent_id)
  if (['in_progress', 'submitted', 'reviewed'].includes(to) && problem) redirect(`/staff/inspections/${insp.id}?error=${encodeURIComponent(problem)}`)
  if (['submitted', 'reviewed'].includes(to)) {
    const [counts] = await sql`select (select count(*) from findings where inspection_id = ${insp.id}) as findings,
      (select count(*) from files where inspection_id = ${insp.id} and category = 'evidence' and status = 'ready') as evidence`
    if (!Number(counts.findings) || !Number(counts.evidence)) redirect(`/staff/inspections/${insp.id}?error=${encodeURIComponent('Add findings and evidence before submitting or reviewing.')}`)
  }
  if (to === 'reviewed') {
    const contributors = await sql`select created_by as id from findings where inspection_id = ${insp.id}
      union select uploaded_by as id from files where inspection_id = ${insp.id}
      union select actor_id as id from events where data->'after'->>'id' = ${insp.id} and type = 'inspections.update' and data->'before'->>'field_notes' is distinct from data->'after'->>'field_notes'`
    // An admin may review a visit they carried out or checked; other reviewers must be independent.
    if (user.role !== 'admin' && (insp.agent_id === user.id || contributors.some(c => c.id === user.id))) redirect(`/staff/inspections/${insp.id}?error=${encodeURIComponent('An independent person must review this inspection.')}`)
  }

  try { await setInspectionStatus(insp.id, to as never, user.id) } catch (e) {
    redirect(`/staff/inspections/${insp.id}?error=${encodeURIComponent(e instanceof Error ? e.message : 'Could not change inspection status.')}`)
  }
  if (to === 'in_progress') {
    if (['planning', 'onboarding'].includes(p.stage)) await setProjectStage(p.id, 'fieldwork')
    await logEvent({ actorId: user.id, projectId: p.id, type: 'inspection.started', summary: `Fieldwork started (${insp.code})`, clientVisible: true })
  }
  if (to === 'submitted') {
    await logEvent({ actorId: user.id, projectId: p.id, type: 'inspection.submitted', summary: `Fieldwork for ${insp.code} complete. Evidence under review`, clientVisible: true })
    if (p.stage === 'fieldwork' || p.stage === 'planning') await setProjectStage(p.id, 'analysis')
    await notifyTeam({ title: `${insp.code} submitted for review`, body: `${p.code} · ${p.title}`, href: `/staff/inspections/${insp.id}`, staffIds: [p.lead_analyst_id] })
  }
  if (to === 'reviewed') {
    // Release reviewed evidence to the client. Items flagged by the integrity check stay internal until someone releases them by hand.
    const released = await sql`
      update files set visible_to_client = true
      where inspection_id = ${insp.id} and category = 'evidence' and status = 'ready' and integrity_flag is null and not visible_to_client
      returning id`
    await logEvent({ actorId: user.id, projectId: p.id, type: 'inspection.reviewed', summary: `${insp.code} reviewed: findings and ${released.length} evidence item${released.length === 1 ? '' : 's'} released`, clientVisible: true })
    await notifyUser(p.client_id, { title: `New findings and evidence: ${p.title}`, body: `The inspection ${insp.code} has been reviewed. Photos, GPS evidence and findings are now in your dashboard.`, href: `/portal/projects/${p.code}?tab=inspections` })
  }
  if (to === 'cancelled') await logEvent({ actorId: user.id, projectId: p.id, type: 'inspection.cancelled', summary: `Site visit ${insp.code} cancelled`, clientVisible: true })
  if (to === 'scheduled') await logEvent({ actorId: user.id, projectId: p.id, type: 'inspection.reopened', summary: `${insp.code} reopened` })
  revalidatePath(`/staff/inspections/${insp.id}`)
  refreshProject(p.code)
}

export async function saveInspectionCheckAction(form: FormData) {
  const user = await requireStaff()
  const { insp, access } = await editableInspection(form, user)
  const p = access.project
  const outcome = str(form, 'outcome')
  const note = formText(form, 'note', 4000) ?? ''
  let evidenceIds = [...new Set(form.getAll('evidenceIds').map(String))].filter(id => /^[0-9a-f-]{36}$/i.test(id))
  if (!['pending','checked','could_not_check','another_visit'].includes(outcome)) return

  // If marked checked and no photos were explicitly selected, auto-link any uploaded evidence for this visit
  if (outcome === 'checked' && evidenceIds.length === 0) {
    const readyFiles = await sql<{ id: string }[]>`select id from files where inspection_id = ${insp.id} and category = 'evidence' and status = 'ready'`
    if (readyFiles.length > 0) {
      evidenceIds = readyFiles.map(f => f.id)
    }
  }

  try {
    await withActor(user.id, async tx => {
      // Auto-start visit if it was still scheduled
      if (insp.status === 'scheduled') {
        await tx`update inspections set status = 'in_progress', started_at = coalesce(started_at, now()) where id = ${insp.id}`
        if (['planning', 'onboarding'].includes(p.stage)) {
          await tx`update projects set stage = 'fieldwork' where id = ${p.id}`
        }
      }

      const [check] = await tx`update inspection_checks set outcome=${outcome},note=${note},evidence_ids=${evidenceIds},updated_by=${user.id}
        where id=${str(form,'checkId')} and inspection_id=${insp.id} returning label`

      // Auto-sync completed check into findings so staff does not need to duplicate entry
      if (outcome === 'checked' && check?.label && note) {
        const [existing] = await tx`select id from findings where inspection_id = ${insp.id} and area = ${check.label}`
        if (existing) {
          await tx`update findings set observation = ${note}, status = 'ok', confidence = 'high', evidence_grade = 'E1', evidence_ids = ${evidenceIds}, updated_at = now()
            where id = ${existing.id}`
        } else {
          await tx`insert into findings (inspection_id, position, area, observation, status, confidence, evidence_grade, created_by, evidence_ids)
            values (${insp.id}, (select coalesce(max(position), 0) + 1 from findings where inspection_id = ${insp.id}),
              ${check.label}, ${note}, 'ok', 'high', 'E1', ${user.id}, ${evidenceIds})`
        }
      }
    })
  } catch (e) { redirect(`/staff/inspections/${insp.id}?error=${encodeURIComponent(e instanceof Error ? e.message : 'Could not save check.')}`) }
  revalidatePath(`/staff/inspections/${insp.id}`)
}

export async function requestInspectionCorrectionAction(form: FormData) {
  const user = await requireStaff(managers)
  const { insp, access } = await inspectionAccess(form, user)
  const reason = formText(form, 'reason', 4000) ?? ''
  const due = dateOrNull(formText(form, 'dueOn', 10))
  const checkId = str(form,'checkId') || null
  if (reason.length < 5 || !insp.agent_id || !['submitted','reviewed'].includes(insp.status)) return
  try {
    await withActor(user.id, async tx => {
      const [locked] = await tx`select status,agent_id from inspections where id=${insp.id} for update`
      if (!['submitted','reviewed'].includes(locked.status)) throw new Error('The visit is already open. Refresh to see its corrections.')
      if (checkId && !(await tx`select 1 from inspection_checks where id=${checkId} and inspection_id=${insp.id}`).length) throw new Error('Choose a check from this visit.')
      await tx`update inspections set status='scheduled' where id=${insp.id}`
      await tx`insert into inspection_corrections(inspection_id,check_id,reason,requested_by,assigned_to,due_on) values(${insp.id},${checkId},${reason},${user.id},${locked.agent_id},${due})`
    })
  } catch (e) { redirect(`/staff/inspections/${insp.id}?error=${encodeURIComponent(e instanceof Error ? e.message : 'Could not request changes.')}`) }
  await logEvent({ actorId:user.id,projectId:insp.project_id,type:'inspection.changes_requested',summary:`${insp.code}: changes requested — ${reason}` })
  await notifyUser(insp.agent_id, { title:`Changes needed on ${insp.code}`,body:reason,href:`/staff/inspections/${insp.id}` })
  revalidatePath(`/staff/inspections/${insp.id}`)
  refreshProject(access.project.code)
}

export async function resolveInspectionCorrectionAction(form: FormData) {
  const user = await requireStaff()
  const { insp } = await editableInspection(form, user)
  const resolution = formText(form,'resolution',4000) ?? ''
  if (resolution.length < 5) return
  await withActor(user.id, async tx => tx`update inspection_corrections set resolved_at=now(),resolved_by=${user.id},resolution=${resolution}
    where id=${str(form,'correctionId')} and inspection_id=${insp.id} and resolved_at is null`)
  await logEvent({ actorId:user.id,projectId:insp.project_id,type:'inspection.correction_resolved',summary:`${insp.code}: correction completed — ${resolution}` })
  revalidatePath(`/staff/inspections/${insp.id}`)
}

export async function fieldNotesAction(form: FormData) {
  const user = await requireStaff()
  const { insp } = await editableInspection(form, user)
  await saveFieldNotes(insp.id, formText(form, 'fieldNotes', 20000), user.id)
  revalidatePath(`/staff/inspections/${insp.id}`)
}

function findingFromForm(form: FormData) {
  const status = str(form, 'status') as FindingStatus
  const confidence = str(form, 'confidence') as Confidence
  const grade = str(form, 'evidenceGrade')
  return {
    area: formText(form, 'area', 200) ?? '',
    observation: formText(form, 'observation', 4000) ?? '',
    status: (['ok', 'warn', 'bad', 'unverified'].includes(status) ? status : 'unverified') as FindingStatus,
    confidence: (confidence in confidenceLabels ? confidence : 'limited') as Confidence,
    evidence_grade: /^E[1-5]$/.test(grade) ? grade : null,
    action: formText(form, 'action', 2000),
    evidence_ids: [...new Set(form.getAll('evidenceIds').map(String))].filter(id => /^[0-9a-f-]{36}$/i.test(id)),
    risk_category: ['Financial','Operational','Legal','Regulatory','Reputational','Environmental'].includes(str(form,'riskCategory')) ? str(form,'riskCategory') : null,
    likelihood: /^[1-5]$/.test(str(form,'likelihood')) ? Number(str(form,'likelihood')) : null,
    impact: /^[1-5]$/.test(str(form,'impact')) ? Number(str(form,'impact')) : null,
  }
}

export async function saveFindingAction(form: FormData) {
  const user = await requireStaff()
  const { insp } = await editableInspection(form, user)
  const f = findingFromForm(form)
  if (!f.area || !f.observation) return
  if (f.evidence_ids.length) {
    const valid = await sql`select id from files where id in ${sql(f.evidence_ids)} and inspection_id = ${insp.id} and project_id = ${insp.project_id} and status = 'ready' and category = 'evidence'`
    if (valid.length !== f.evidence_ids.length) return
  }
  if (['warn','bad'].includes(f.status) && (!f.risk_category || !f.likelihood || !f.impact || !f.action)) redirect(`/staff/inspections/${insp.id}?error=${encodeURIComponent('Risk findings require category, likelihood, impact and mitigation action.')}`)
  const id = str(form, 'findingId')
  if (id) await updateFinding(id, insp.id, f, user.id)
  else await addFinding(insp.id, f, user.id)
  revalidatePath(`/staff/inspections/${insp.id}`)
}

export async function deleteFindingAction(form: FormData) {
  const user = await requireStaff()
  const { insp } = await editableInspection(form, user)
  await deleteFinding(str(form, 'findingId'), insp.id, user.id)
  revalidatePath(`/staff/inspections/${insp.id}`)
}

// ---------- Files ----------

export async function fileMetaAction(form: FormData) {
  const user = await requireStaff()
  const file = await getFile(str(form, 'fileId'))
  if (!file?.project_id) return
  const access = await projectFor(user, file.project_id)
  if (!access?.canFieldwork) return
  const visible = access.canManage ? form.get('visible') === 'on' : file.visible_to_client
  if (user.role === 'field_agent' && file.uploaded_by !== user.id) return
  if (user.role === 'field_agent') {
    const problem = await uploadWriteProblem(user, file)
    if (problem) redirect(`/staff/projects/${access.project.code}?tab=evidence&error=${encodeURIComponent(problem)}`)
  }
  try { await updateFileMeta(file.id, { caption: formText(form, 'caption', 500), visibleToClient: file.category === 'client_document' ? true : visible,
    fieldAccess: access.canManage && file.category === 'client_document' ? form.get('fieldAccess') === 'on' : file.field_access,
    qaNote: access.canManage ? formText(form, 'qaNote', 2000) : null }, user.id) } catch (e) {
    redirect(`/staff/projects/${access.project.code}?tab=evidence&error=${encodeURIComponent(e instanceof Error ? e.message : 'Could not update file.')}`)
  }
  if (visible && !file.visible_to_client) {
    await logEvent({ actorId: user.id, projectId: file.project_id, type: 'file.released', summary: `${file.evidence_code ?? file.filename} released to client${file.integrity_flag ? ` after manual check (${file.integrity_flag})` : ''}` })
  }
  refreshProject(access.project.code)
  if (file.inspection_id) revalidatePath(`/staff/inspections/${file.inspection_id}`)
}

export async function deleteFileAction(form: FormData) {
  const user = await requireStaff(managers)
  const file = await getFile(str(form, 'fileId'))
  if (!file?.project_id) return
  const access = await projectFor(user, file.project_id)
  if (!access?.canManage) return
  const used = await sql`select 1 from report_evidence where file_id = ${file.id}`
  if (used.length) return
  let key
  try { key = await deleteFileRow(file.id) } catch (e) {
    redirect(`/staff/projects/${access.project.code}?tab=evidence&error=${encodeURIComponent(e instanceof Error ? e.message : 'Could not delete file.')}`)
  }
  if (key) await deleteObject(key)
  await logEvent({ actorId: user.id, projectId: file.project_id, type: 'file.deleted', summary: `Deleted ${file.evidence_code ?? ''} ${file.filename} (sha256 ${file.sha256?.slice(0, 12) ?? '-'})`.trim() })
  refreshProject(access.project.code)
  if (file.inspection_id) revalidatePath(`/staff/inspections/${file.inspection_id}`)
}

// ---------- Reports (stage 7–8) ----------

export async function createReportAction(form: FormData) {
  const user = await requireStaff(managers)
  const access = await managedProject(form, user)
  const inspectionId = /^[0-9a-f-]{36}$/.test(str(form, 'inspectionId')) ? str(form, 'inspectionId') : null
  try { await validateReportInspection(access.project.id, inspectionId) } catch {
    redirect(`/staff/projects/${access.project.code}?tab=reports&error=${encodeURIComponent('Choose a reviewed inspection from this project.')}`)
  }
  const id = await createReport(access.project.id, { title: formText(form, 'title', 200) ?? `${access.project.service_name ?? 'Verification'} report`, inspectionId, supersedesId: str(form, 'supersedesId') || null }, user.id)
  await logEvent({ actorId: user.id, projectId: access.project.id, type: 'report.created', summary: 'Report draft started' })
  redirect(`/staff/projects/${access.project.code}/reports/${id}`)
}

export async function saveReportAction(_: StaffState, form: FormData): Promise<StaffState> {
  const user = await requireStaff(managers)
  const r = await getReport(str(form, 'reportId'))
  if (!r) return { error: 'Report not found.' }
  const access = await projectFor(user, r.project_id)
  if (!access?.canManage) return { error: 'Not allowed.' }
  if (r.status !== 'draft') return { error: 'Return the report to draft before editing. Delivered reports require a corrected version.' }
  const overall = str(form, 'overallStatus')
  const pdf = str(form, 'pdfFileId')
  if (pdf) {
    const f = await getFile(pdf)
    if (!f || f.project_id !== r.project_id || f.category !== 'report' || f.status !== 'ready') return { error: 'Choose a ready PDF uploaded to this project.' }
  }
  try { await updateReport(r.id, {
    title: formText(form, 'title', 200) ?? r.title,
    inspectionId: /^[0-9a-f-]{36}$/.test(str(form, 'inspectionId')) ? str(form, 'inspectionId') : null,
    executiveSummary: formText(form, 'executiveSummary', 20000) ?? '',
    overallStatus: ['ok', 'warn', 'bad'].includes(overall) ? (overall as 'ok') : null,
    recommendedDecision: formText(form, 'recommendedDecision', 200),
    recommendations: formText(form, 'recommendations', 20000),
    limitations: formText(form, 'limitations', 8000) ?? '',
    pdfFileId: pdf || null,
    scope: formText(form, 'scope', 20000) ?? '',
    methodology: formText(form, 'methodology', 20000) ?? '',
  }, user.id) } catch (e) { return { error: e instanceof Error ? e.message : 'Could not save report.' } }

  const intent = str(form, 'intent')
  if (intent === 'submit') {
    if (!formText(form, 'executiveSummary', 10) || !['ok', 'warn', 'bad'].includes(overall)) return { error: 'Add an executive summary and an overall status before submitting for review.' }
    await setReportStatus(r.id, 'in_review', user.id)
    await logEvent({ actorId: user.id, projectId: r.project_id, type: 'report.submitted', summary: `Report "${r.title}" submitted for review` })
    await notifyTeam({ title: `Report ready for review: ${access.project.code}`, body: r.title, href: `/staff/projects/${access.project.code}/reports/${r.id}` })
  }
  revalidatePath(`/staff/projects/${access.project.code}/reports/${r.id}`)
  return { ok: true, message: intent === 'submit' ? 'Submitted for review.' : 'Saved.' }
}

export async function reportStatusAction(form: FormData) {
  const user = await requireStaff(managers)
  const r = await getReport(str(form, 'reportId'))
  if (!r) return
  const access = await projectFor(user, r.project_id)
  if (!access?.canManage) return
  const p = access.project
  const to = str(form, 'to')

  if (to === 'published') {
    if (r.status !== 'in_review') return
    try { await publishReport(r.id, user, p) } catch (e) {
      redirect(`/staff/projects/${p.code}/reports/${r.id}?error=${encodeURIComponent(e instanceof Error ? e.message : 'Publication failed.')}`)
    }
    await logEvent({ actorId: user.id, projectId: p.id, type: 'report.published', summary: `Report published: ${r.title}`, clientVisible: true })
    // The recommendation stays out of the notification until the balance is paid.
    const lock = await reportLock(p.id)
    await notifyUser(p.client_id, {
      title: `Your report is ready: ${p.title}`,
      body: lock
        ? `"${r.title}" is ready. It opens once the remaining balance of KES ${lock.owedKes.toLocaleString('en-US')} is paid.`
        : `"${r.title}" has been reviewed and published.${r.recommended_decision ? ` Recommended decision: ${r.recommended_decision}.` : ''}`,
      href: `/portal/projects/${p.code}/reports/${r.id}`,
    })
  } else if (to === 'draft') {
    if (r.status !== 'in_review') return
    await setReportStatus(r.id, 'draft', user.id)
    await logEvent({ actorId: user.id, projectId: p.id, type: 'report.returned', summary: `Report "${r.title}" returned to draft${formText(form, 'note', 1000) ? `: ${formText(form, 'note', 1000)}` : ''}` })
    if (r.author_id) await notifyUser(r.author_id, { title: `Report returned for changes: ${p.code}`, body: formText(form, 'note', 1000) ?? undefined, href: `/staff/projects/${p.code}/reports/${r.id}`, email: false })
  } else if (to === 'withdrawn') {
    if (r.status !== 'published') return
    try { await withdrawReport(r.id, user.id, formText(form, 'note', 1000) ?? '') } catch (e) {
      redirect(`/staff/projects/${p.code}/reports/${r.id}?error=${encodeURIComponent(e instanceof Error ? e.message : 'Withdrawal failed.')}`)
    }
    await logEvent({ actorId: user.id, projectId: p.id, type: 'report.withdrawn', summary: `Report withdrawn: ${r.title}`, clientVisible: true })
    await notifyUser(p.client_id, { title: `Report withdrawn: ${p.title}`, body: formText(form, 'note', 1000) ?? '', href: `/portal/projects/${p.code}?tab=reports` })
  }
  revalidatePath(`/staff/projects/${p.code}/reports/${r.id}`)
  refreshProject(p.code)
}

// =====================================================================
// Enquiries, team, pricing (admin)
// =====================================================================

export async function enquiryStatusAction(form: FormData) {
  await requireStaff(managers)
  const status = str(form, 'status')
  if (!['new', 'replied', 'converted', 'closed'].includes(status)) return
  if (status === 'converted') {
    const [enquiry]=await sql`select request_id from enquiries where id=${str(form,'id')}`
    if (!enquiry?.request_id) redirect(`/staff/enquiries?error=${encodeURIComponent('Use Convert to client request to link this enquiry before marking it converted.')}`)
  }
  await setEnquiryStatus(str(form, 'id'), status as 'new')
  revalidatePath('/staff/enquiries')
}

export async function inviteStaffAction(_: StaffState, form: FormData): Promise<StaffState> {
  const admin = await requireStaff(['admin'])
  const email = emailSchema.safeParse(form.get('email'))
  const fullName = formText(form, 'fullName', 120)
  const role = str(form, 'role') as Role
  if (!email.success) return { error: 'Enter a valid email.' }
  if (!fullName) return { error: 'Enter their name.' }
  if (!staffRoles.includes(role)) return { error: 'Choose a role.' }
  const existing = await findUserByEmail(email.data)
  if (existing) return { error: existing.role === 'client' ? 'That email belongs to a client account.' : 'That person already has a staff account.' }
  const id = await createStaffAccount({ email: email.data, fullName, role, phone: formText(form, 'phone', 40) })
  await sendInvite(id, email.data, fullName, admin.full_name)
  await logEvent({ actorId: admin.id, type: 'team.invited', summary: `${fullName} invited as ${role}`, ipHash: await requestIpHash() })
  revalidatePath('/staff/team')
  return { ok: true, message: `Invitation sent to ${email.data}.` }
}

async function sendInvite(userId: string, email: string, name: string, from: string) {
  const token = await issueToken(userId, 'invite')
  await sendEmail({
    to: email,
    subject: 'Your AngaVeritas staff account',
    text: [
      `Hello ${name.split(' ')[0]},`,
      '',
      `${from} has invited you to the AngaVeritas workspace. Choose your password here (the link works for 7 days):`,
      `${appUrl()}/invite?token=${token}`,
    ].join('\n'),
  })
}

export async function resendInviteAction(form: FormData) {
  const admin = await requireStaff(['admin'])
  const u = await getUserById(str(form, 'userId'))
  if (!u || u.role === 'client' || u.password_hash) return
  await sendInvite(u.id, u.email, u.full_name, admin.full_name)
  revalidatePath('/staff/team')
}

export async function setRoleAction(form: FormData) {
  const admin = await requireStaff(['admin'])
  const u = await getUserById(str(form, 'userId'))
  const role = str(form, 'role') as Role
  if (!u || u.role === 'client' || !staffRoles.includes(role) || u.role === role) return
  if (u.role === 'admin' && role !== 'admin' && (await countAdmins()) <= 1) return // never remove the last admin
  try { await setStaffRole(u.id, role) } catch (e) {
    redirect(`/staff/team?error=${encodeURIComponent(e instanceof Error ? e.message : 'Could not change role.')}`)
  }
  await logEvent({ actorId: admin.id, type: 'team.role', summary: `${u.full_name}: role changed to ${role}` })
  revalidatePath('/staff/team')
}

export async function setDisabledAction(form: FormData) {
  const admin = await requireStaff(['admin'])
  const u = await getUserById(str(form, 'userId'))
  if (!u || u.id === admin.id) return
  const disable = form.get('disable') === '1'
  if (disable && u.role === 'admin' && (await countAdmins()) <= 1) return
  try { await setDisabled(u.id, disable) } catch (e) {
    redirect(`/staff/team?error=${encodeURIComponent(e instanceof Error ? e.message : 'Could not change account access.')}`)
  }
  await logEvent({ actorId: admin.id, type: disable ? 'account.disabled' : 'account.enabled', summary: `${u.full_name} ${disable ? 'disabled' : 're-enabled'}` })
  revalidatePath('/staff/team')
  revalidatePath('/staff/clients')
}

const num = (form: FormData, key: string) => {
  const raw = String(form.get(key) ?? '').replace(/,/g, '').trim()
  return raw === '' ? Number.NaN : Number(raw)
}

/** Rebuilds the config from the pricing form, keeping the existing structure. */
function configFromForm(base: PricingConfig, form: FormData): PricingConfig {
  return {
    multiSiteFee: num(form, 'multiSiteFee'),
    origin: { label: String(form.get('origin.label') ?? ''), lat: num(form, 'origin.lat'), lng: num(form, 'origin.lng') },
    services: base.services.map((s) => ({ ...s, name: String(form.get(`service.${s.code}.name`) ?? s.name), baseFee: num(form, `service.${s.code}.baseFee`), active: form.get(`service.${s.code}.active`) === 'on' })),
    travel: Object.fromEntries(Object.keys(base.travel).map((k) => [k, num(form, `travel.${k}`)])) as PricingConfig['travel'],
    complexity: base.complexity.map((t) => ({ ...t, minScore: num(form, `tier.${t.code}.min`), maxScore: num(form, `tier.${t.code}.max`), multiplier: num(form, `tier.${t.code}.mult`) })),
    addons: base.addons.map((a) => ({ ...a, name: String(form.get(`addon.${a.code}.name`) ?? a.name), price: num(form, `addon.${a.code}.price`), active: form.get(`addon.${a.code}.active`) === 'on' })),
    urgency: base.urgency.map((u) => {
      const max = num(form, `urgency.${u.code}.pctMax`)
      return {
        ...u,
        delivery: String(form.get(`urgency.${u.code}.delivery`) ?? u.delivery),
        pct: num(form, `urgency.${u.code}.pct`),
        pctMax: Number.isNaN(max) ? undefined : max,
        active: u.code === 'standard' ? true : form.get(`urgency.${u.code}.active`) === 'on',
      }
    }),
  }
}

export async function savePricingAction(_: StaffState, form: FormData): Promise<StaffState> {
  const admin = await requireStaff(managers)
  if (admin.role !== 'admin') return { errors: ['Only admins can change pricing.'] }
  const { config: base } = await getActivePricing()
  const parsed = pricingConfigSchema.safeParse(configFromForm(base, form))
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => `${i.path.join(' › ')}: ${/nan/i.test(i.message) ? 'enter a number' : i.message}`) }
  const problems = configProblems(parsed.data)
  if (problems.length) return { errors: problems }
  const note = String(form.get('note') ?? '').trim().slice(0, 300) || null
  const id = await savePricingVersion(parsed.data, note, admin.id)
  await logEvent({ actorId: admin.id, type: 'pricing.saved', summary: `Pricing version ${id} saved${note ? `: ${note}` : ''}` })
  revalidatePath('/staff/pricing')
  revalidatePath('/estimate')
  return { ok: true }
}

export async function restorePricingAction(form: FormData) {
  const admin = await requireStaff(['admin'])
  const v = await getPricingVersion(Number(form.get('id')))
  if (!v) return
  const parsed = pricingConfigSchema.safeParse(v.config)
  if (!parsed.success) return
  const id = await savePricingVersion(parsed.data, `Restored version ${v.id}`, admin.id)
  await logEvent({ actorId: admin.id, type: 'pricing.saved', summary: `Pricing version ${id} restored from ${v.id}` })
  revalidatePath('/staff/pricing')
  revalidatePath('/estimate')
}

export async function publicPricesAction(form: FormData) {
  const admin = await requireStaff(['admin'])
  const show = form.get('show') === 'yes'
  await setSiteSetting('showPublicPrices', show, admin.id)
  await logEvent({ actorId: admin.id, type: 'settings.saved', summary: show ? 'Prices shown on the public website' : 'Prices hidden on the public website' })
  revalidatePath('/staff/pricing')
  for (const path of ['/', '/services', '/pricing']) revalidatePath(path)
}

export async function staffMarkReadAction() {
  const user = await requireStaff()
  await sql`update notifications set read_at = now() where user_id = ${user.id} and read_at is null`
  revalidatePath('/staff', 'layout')
}
