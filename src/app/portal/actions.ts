'use server'

import { createCase } from '@/lib/data/engagements'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { logEvent, notifyTeam, notifyUser } from '@/lib/activity'
import { hashPassword, passwordProblem, verifyPassword } from '@/lib/auth/password'
import { destroyAllSessions, requestIpHash, requireClient } from '@/lib/auth/session'
import { inKenya } from '@/lib/coordinates'
import { sql } from '@/lib/db'
import { postMessage } from '@/lib/data/messages'
import { addContact, projectFor, removeContact, saveOnboarding, submitOnboarding } from '@/lib/data/projects'
import { acceptProposal, declineProposal, getProposal } from '@/lib/data/proposals'
import { emailInvoice } from '@/lib/invoice-send'
import { rateReport } from '@/lib/data/reports'
import { briefProfile, validateServiceBrief } from '@/lib/service-briefs'
import { getRequestById, setRequestStatus } from '@/lib/data/requests'
import { getUserById, setPassword, updateProfile } from '@/lib/data/users'
import { accountLocationSchema, accountPhoneSchema, formText, whatsappSchema } from '@/lib/validation'

export type ActionState = { error?: string; ok?: boolean; message?: string; field?: string; nextStep?: number } | null

// ---------- Proposals (stage 3) ----------

export async function acceptProposalAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireClient()
  const id = String(form.get('proposalId') ?? '')
  const name = String(form.get('acceptedName') ?? '').trim().slice(0, 120)
  if (form.get('agree') !== 'on') return { error: 'Please confirm that you accept the scope, price and terms.' }
  if (name.length < 2) return { error: 'Type your full name to sign.' }
  if (name.toLowerCase().replace(/\s+/g, ' ') !== user.full_name.toLowerCase().replace(/\s+/g, ' '))
    return { error: `Type your name exactly as on your account (${user.full_name}). To change it, update your account first.` }
  if (!user.email_verified_at) return { error: 'Please confirm your email address before accepting the proposal.' }
  const p = await getProposal(id)
  if (!p) return { error: 'Proposal not found.' }

  let result
  try {
    result = await acceptProposal(id, user.id, name, form.get('nda') === 'on', await requestIpHash())
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not accept the proposal.' }
  }
  const request = await getRequestById(result.requestId)
  await logEvent({
    actorId: user.id,
    requestId: result.requestId,
    projectId: result.project.id,
    type: 'proposal.accepted',
    summary: `Proposal v${p.version} accepted and signed by ${name}${form.get('nda') === 'on' ? ' (NDA requested)' : ''}`,
    clientVisible: true,
    ipHash: await requestIpHash(),
  })
  await logEvent({
    actorId: user.id,
    projectId: result.project.id,
    type: result.followUp ? 'project.follow_up_added' : 'project.created',
    summary: result.followUp ? `Follow-up work added from ${request?.reference}` : `Project ${result.project.code} opened. Next: your site details`,
    clientVisible: true,
  })
  await notifyTeam({
    title: `${request?.reference} accepted: project ${result.project.code}`,
    body: `${user.full_name} accepted "${p.title}" (${p.total_kes.toLocaleString('en-US')} KES).${form.get('nda') === 'on' ? ' They asked for an NDA.' : ''} Confirm payment and assign the team.`,
    href: `/staff/projects/${result.project.code}`,
    staffIds: request?.owner_id ? [request.owner_id] : undefined,
  })
  // The client gets the invoice as a PDF straight away. A failed email never undoes the acceptance.
  const [invoice] = await sql<{ id: string }[]>`select id from invoices where proposal_id = ${id}`
  if (invoice) await emailInvoice(invoice.id, result.project.id, null, 'issued').catch((e) => console.error('[invoice] email failed', e))
  // The lead analyst is either the request owner or the person who wrote the
  // proposal. Tell them directly when the team notification went elsewhere.
  const [saved] = await sql<{ lead_analyst_id: string | null }[]>`select lead_analyst_id from projects where id = ${result.project.id}`
  if (saved?.lead_analyst_id && saved.lead_analyst_id !== request?.owner_id) {
    await notifyUser(saved.lead_analyst_id, {
      title: result.followUp ? `New work on ${result.project.code}` : `You are lead analyst on ${result.project.code}`,
      body: `${user.full_name} accepted "${p.title}". Confirm payment, assign the field agent and plan the visit.`,
      href: `/staff/projects/${result.project.code}`,
      email: false,
    })
  }
  redirect(`/portal/projects/${result.project.code}?tab=onboarding&accepted=1`)
}

export async function declineProposalAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireClient()
  const id = String(form.get('proposalId') ?? '')
  const reason = formText(form, 'reason', 2000)
  let p
  try {
    p = await declineProposal(id, user.id, reason, await requestIpHash())
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not decline the proposal.' }
  }
  const request = await getRequestById(p.request_id)
  await logEvent({ actorId: user.id, requestId: p.request_id, type: 'proposal.declined', summary: `Proposal v${p.version} declined${reason ? `: ${reason}` : ''}`, clientVisible: true })
  await notifyTeam({ title: `${request?.reference}: proposal declined`, body: `${user.full_name} declined "${p.title}".${reason ? `\nReason: ${reason}` : ''}`, href: `/staff/requests/${request?.reference}` })
  revalidatePath(`/portal/requests/${request?.reference}`)
  return { ok: true }
}

export async function withdrawRequestAction(form: FormData) {
  const user = await requireClient()
  const r = await getRequestById(String(form.get('requestId') ?? ''))
  if (!r || r.client_id !== user.id || !['submitted', 'in_review', 'proposal_sent'].includes(r.status)) return
  await setRequestStatus(r.id, 'withdrawn')
  await sql`update proposals set status = 'superseded' where request_id = ${r.id} and status = 'sent'`
  await logEvent({ actorId: user.id, requestId: r.id, type: 'request.withdrawn', summary: 'Request withdrawn by client', clientVisible: true })
  await notifyTeam({ title: `${r.reference} withdrawn by client`, href: `/staff/requests/${r.reference}` })
  revalidatePath(`/portal/requests/${r.reference}`)
}

// ---------- Messages ----------

export async function clientMessageAction(form: FormData) {
  const user = await requireClient()
  const body = String(form.get('body') ?? '').trim().slice(0, 8000)
  if (!body) return
  const projectId = String(form.get('projectId') ?? '')
  const requestId = String(form.get('requestId') ?? '')
  if (projectId) {
    const access = await projectFor(user, projectId)
    if (!access) return
    await postMessage({ projectId }, user.id, body, false)
    await notifyTeam({
      title: `${access.project.code}: message from ${user.full_name}`,
      replyTo: user.email,
      body,
      href: `/staff/projects/${access.project.code}?tab=messages`,
      staffIds: [access.project.lead_analyst_id],
    })
    revalidatePath(`/portal/projects/${access.project.code}`)
  } else if (requestId) {
    const r = await getRequestById(requestId)
    if (!r || r.client_id !== user.id) return
    await postMessage({ requestId }, user.id, body, false)
    await notifyTeam({ title: `${r.reference}: message from ${user.full_name}`, replyTo: user.email, body, href: `/staff/requests/${r.reference}#messages`, staffIds: r.owner_id ? [r.owner_id] : undefined })
    revalidatePath(`/portal/requests/${r.reference}`)
  }
}

// ---------- Onboarding (stage 4) ----------

async function ownProject(form: FormData) {
  const user = await requireClient()
  const access = await projectFor(user, String(form.get('projectId') ?? ''))
  if (!access) throw new Error('Project not found.')
  return { user, project: access.project }
}

export async function saveOnboardingAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { user, project } = await ownProject(form)
  // The brief is what the team verifies against, so it is fixed once fieldwork starts.
  if (!['onboarding', 'planning'].includes(project.stage)) return { error: 'The brief is locked now that fieldwork has started. Message your analyst about any change.' }
  const profile = briefProfile(project)
  const final = form.get('intent') === '1'
  const continuing = form.get('intent') === 'continue'
  const section = Number(form.get('section'))
  if (continuing && section !== 0 && section !== 1) return {error:'Please complete the current section first.'}
  const alreadySubmitted = !!project.onboarding_submitted_at && !!project.data_consent_at
  const checked = validateServiceBrief(profile, Object.fromEntries(profile.fields.map(f => [f.key, form.get(`service.${f.key}`)])), final || continuing || alreadySubmitted, continuing && !alreadySubmitted ? section as 0 | 1 : 1)
  if (checked.error) return { error: checked.error, field: `service.${checked.field}` }
  const title = formText(form, 'title', 140)
  if (!title || title.length < 3) return { error: 'Please give the project a name.' }
  if (form.get('intent') === '1' && form.get('consent') !== 'on') return {error:'Please confirm consent to process the project information.'}
  if ((final || continuing || alreadySubmitted) && !formText(form,'locationLabel') && (profile.code === 'feasibility' || (profile.physicalLocation && !formText(form,'siteDirections')))) return {error:`Please provide ${profile.location.toLowerCase()}.`, field:'locationLabel'}
  const rawValue = String(form.get('investmentValue') ?? '').replace(/[^\d]/g, '')
  // Map pin: kept only inside Kenya. Leaving both fields out keeps the stored pin.
  const pinSent = form.has('locationLat') || form.has('locationLng')
  const rawLat = String(form.get('locationLat') ?? '').trim()
  const rawLng = String(form.get('locationLng') ?? '').trim()
  const pin = rawLat && rawLng && inKenya(Number(rawLat), Number(rawLng)) ? { lat: Number(rawLat), lng: Number(rawLng) } : null
  await saveOnboarding(project.id, user.id, {
    title,
    locationLabel: formText(form, 'locationLabel', 200),
    county: formText(form, 'county', 80),
    locationLat: pinSent ? (pin?.lat ?? null) : undefined,
    locationLng: pinSent ? (pin?.lng ?? null) : undefined,
    siteDirections: formText(form, 'siteDirections'),
    siteAccessNotes: formText(form, 'siteAccessNotes'),
    claims: formText(form, 'claims'),
    concerns: formText(form, 'concerns', 3000),
    investmentValueKes: rawValue ? Math.min(Number(rawValue), 1e13) : null,
    serviceBrief: checked.brief,
  })
  revalidatePath(`/portal/projects/${project.code}`)
  revalidatePath('/portal')
  if (continuing) return {ok:true,message:section === 0 ? 'Details saved. Next, tell us what to check.' : 'Your answers are saved. Review them and give consent before sending.',nextStep:section+1}
  if (form.get('intent') === '1') {
    if (form.get('consent') !== 'on') return { error: 'Please confirm consent to process the project information.' }
    const submitted = await submitOnboarding(project.id, user.id)
    if (submitted) {
      await logEvent({ actorId: user.id, projectId: project.id, type: 'onboarding.submitted', summary: `${profile.tab} sent. Your analyst will review the brief.`, clientVisible: true })
      await notifyTeam({
        title: `${project.code}: onboarding completed`,
        body: `${user.full_name} sent ${profile.tab.toLowerCase()} for "${title}". Review the service brief, contact restrictions and agreed scope before planning the work.`,
        href: `/staff/projects/${project.code}`,
        staffIds: [project.lead_analyst_id],
      })
    }
    redirect(`/portal/projects/${project.code}?onboarded=1`)
  }
  return { ok: true, message: project.onboarding_submitted_at && project.data_consent_at ? 'Changes saved. Your analyst can see the updated brief.' : 'Draft saved. Continue when ready, then use Review & send to submit your brief.' }
}

export async function addContactAction(form: FormData) {
  const { user, project } = await ownProject(form)
  const name = formText(form, 'name', 120)
  if (!name) return
  await addContact(
    project.id,
    { name, role: formText(form, 'role', 120), phone: formText(form, 'phone', 40), email: formText(form, 'email', 160), notes: formText(form, 'notes', 1000), mayContact: form.get('mayContact') === 'on' },
    user.id,
  )
  revalidatePath(`/portal/projects/${project.code}`)
}

export async function removeContactAction(form: FormData) {
  const { project } = await ownProject(form)
  await removeContact(project.id, String(form.get('contactId') ?? ''))
  revalidatePath(`/portal/projects/${project.code}`)
}

// ---------- Reports (stage 8–9) ----------

export async function recordReportViewAction(reportId: string) {
  const user = await requireClient()
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) return
  await sql`insert into report_reads(report_id,user_id)
    select r.id,${user.id} from reports r join projects p on p.id=r.project_id
    where r.id=${reportId} and r.status='published' and p.client_id=${user.id} and work_order_unlocked(r.work_order_id)
    on conflict do nothing`
  revalidatePath('/portal')
  revalidatePath('/portal/projects')
}

export async function rateReportAction(form: FormData) {
  const { user, project } = await ownProject(form)
  const rating = Number(form.get('rating'))
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return
  const reportId = String(form.get('reportId') ?? '')
  const feedback = formText(form, 'feedback', 2000)
  await rateReport(reportId, project.id, rating, feedback)
  await logEvent({ actorId: user.id, projectId: project.id, type: 'report.rated', summary: `Client rated the report ${rating}/5${feedback ? `: ${feedback}` : ''}` })
  if (rating <= 3) await createCase(project.id,user.id,{kind:'complaint',detail:feedback&&feedback.length>=10?feedback:`Client rated the report ${rating}/5 and requested follow-up.`,reportId})
  if (rating <= 3) await notifyTeam({ title: `${project.code}: report rated ${rating}/5`, body: feedback ?? 'No comment.', href: `/staff/projects/${project.code}?tab=reports`, staffIds: [project.lead_analyst_id] })
  revalidatePath(`/portal/projects/${project.code}/reports/${reportId}`)
}

// ---------- Account ----------

export async function updateProfileAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireClient()
  const fullName = formText(form, 'fullName', 120)
  if (!fullName || fullName.length < 2) return { error: 'Please enter your full name.' }
  const phone = accountPhoneSchema.safeParse(form.get('phone'))
  const whatsapp = whatsappSchema.safeParse(form.get('whatsapp') ?? undefined)
  if (!phone.success) return { error: phone.error.issues[0]?.message }
  if (!whatsapp.success) return { error: whatsapp.error.issues[0]?.message }
  const location = accountLocationSchema.safeParse({ countryCode: form.get('countryCode'), regionCode: form.get('regionCode') })
  if (!location.success) return { error: location.error.issues[0]?.message }
  const tz = formText(form, 'timezone', 60) ?? 'Africa/Nairobi'
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
  } catch {
    return { error: 'Unknown time zone.' }
  }
  await updateProfile(user.id, { fullName, phone: phone.data, whatsapp: whatsapp.data, ...location.data, timezone: tz })
  revalidatePath('/portal', 'layout')
  return { ok: true, message: 'Saved.' }
}

export async function changePasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  const session = await requireClient()
  const user = await getUserById(session.id)
  if (!user || !(await verifyPassword(String(form.get('current') ?? ''), user.password_hash))) return { error: 'Your current password is not correct.' }
  const next = String(form.get('password') ?? '')
  if (next !== String(form.get('confirm') ?? '')) return { error: 'The new passwords do not match.' }
  const problem = passwordProblem(next)
  if (problem) return { error: problem }
  await setPassword(user.id, await hashPassword(next))
  await destroyAllSessions(user.id, true)
  await logEvent({ actorId: user.id, type: 'account.password_changed', summary: 'Password changed', ipHash: await requestIpHash() })
  return { ok: true, message: 'Password changed. Other devices have been signed out.' }
}
