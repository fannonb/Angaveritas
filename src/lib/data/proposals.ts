import 'server-only'
import { sql } from '@/lib/db'
import type { ProposalStatus } from '@/lib/labels'
import { reconcileProjectPayment } from './operations'

export type LineItem = { label: string; detail?: string; amount: number }

export type ProposalRow = {
  id: string
  request_id: string
  version: number
  status: ProposalStatus
  title: string
  objectives: string
  scope_items: string[]
  deliverables: string[]
  exclusions: string | null
  timeline: string
  line_items: LineItem[]
  total_kes: number
  deposit_kes: number | null
  payment_terms: string
  valid_until: string | null
  terms_version: string
  nda_offered: boolean
  created_by: string | null
  created_at: Date
  sent_at: Date | null
  responded_at: Date | null
  accepted_name: string | null
  nda_requested: boolean | null
  decline_reason: string | null
}

export type ProposalInput = {
  title: string
  objectives: string
  scopeItems: string[]
  deliverables: string[]
  exclusions: string | null
  timeline: string
  lineItems: LineItem[]
  paymentTerms: string
  validUntil: string | null
  termsVersion: string
  ndaOffered: boolean
  depositKes?: number | null
}

export async function listProposals(requestId: string) {
  return sql<ProposalRow[]>`select * from proposals where request_id = ${requestId} order by version desc`
}

/** The proposal a client should see: the latest one that has been sent (never drafts). */
export async function currentClientProposal(requestId: string) {
  const [row] = await sql<ProposalRow[]>`
    select * from proposals where request_id = ${requestId} and status <> 'draft' order by version desc limit 1`
  return row ?? null
}

export async function getProposal(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const [row] = await sql<ProposalRow[]>`select * from proposals where id = ${id}`
  return row ?? null
}

const total = (items: LineItem[]) => items.reduce((s, i) => s + Math.round(i.amount), 0)

export async function saveDraft(requestId: string, p: ProposalInput, actorId: string, draftId?: string) {
  if (draftId) {
    const [row] = await sql<{ id: string }[]>`
      update proposals set
        title = ${p.title}, objectives = ${p.objectives}, scope_items = ${p.scopeItems}, deliverables = ${p.deliverables},
        exclusions = ${p.exclusions}, timeline = ${p.timeline}, line_items = ${sql.json(p.lineItems as never)},
        total_kes = ${total(p.lineItems)}, payment_terms = ${p.paymentTerms}, valid_until = ${p.validUntil},
        terms_version = ${p.termsVersion}, nda_offered = ${p.ndaOffered}, deposit_kes = ${p.depositKes ?? null}
      where id = ${draftId} and request_id = ${requestId} and status = 'draft'
      returning id`
    if (!row) throw new Error('Only drafts can be edited.')
    return row.id
  }
  const [row] = await sql<{ id: string }[]>`
    insert into proposals (request_id, version, title, objectives, scope_items, deliverables, exclusions, timeline,
      line_items, total_kes, payment_terms, valid_until, terms_version, nda_offered, created_by,deposit_kes)
    values (${requestId}, (select coalesce(max(version), 0) + 1 from proposals where request_id = ${requestId}),
      ${p.title}, ${p.objectives}, ${p.scopeItems}, ${p.deliverables}, ${p.exclusions}, ${p.timeline},
      ${sql.json(p.lineItems as never)}, ${total(p.lineItems)}, ${p.paymentTerms}, ${p.validUntil}, ${p.termsVersion},
      ${p.ndaOffered}, ${actorId},${p.depositKes ?? null})
    returning id`
  return row.id
}

/** Sends a draft to the client; any earlier open version is superseded. */
export async function sendProposal(id: string) {
  return sql.begin(async (tx) => {
    const [p] = await tx<ProposalRow[]>`select * from proposals where id = ${id} for update`
    if (!p || p.status !== 'draft') throw new Error('Only a draft can be sent.')
    const [request] = await tx`select status from requests where id=${p.request_id} for update`
    if (!request || !['submitted','in_review','proposal_sent','declined'].includes(request.status)) throw new Error('The request is closed for new proposals.')
    await tx`update proposals set status = 'superseded' where request_id = ${p.request_id} and status = 'sent'`
    await tx`update proposals set status = 'sent', sent_at = now() where id = ${id}`
    await tx`update requests set status = 'proposal_sent' where id = ${p.request_id}`
    return p
  })
}

export async function deleteDraft(id: string) {
  await sql`delete from proposals where id = ${id} and status = 'draft'`
}

/**
 * Client accepts. In one transaction: the proposal is accepted, the request
 * marked accepted, and the project created from both (stage: onboarding).
 */
export async function acceptProposal(id: string, clientId: string, acceptedName: string, ndaRequested: boolean, ipHash: string) {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.actor_id',${clientId},true),set_config('app.ip_hash',${ipHash},true)`
    const [p] = await tx<(ProposalRow & { client_id: string })[]>`
      select p.*, r.client_id from proposals p join requests r on r.id = p.request_id where p.id = ${id} for update of p`
    if (!p || p.client_id !== clientId) throw new Error('Proposal not found.')
    const [request] = await tx`select status from requests where id=${p.request_id} for update`
    if (request?.status !== 'proposal_sent') throw new Error('The request is no longer open for acceptance.')
    if (p.status !== 'sent') throw new Error('This proposal is no longer open. Please refresh the page.')
    if (p.valid_until && new Date(`${p.valid_until}T23:59:59+03:00`) < new Date())
      throw new Error('This proposal has expired. Send us a message and we will reissue it.')

    await tx`
      update proposals set status = 'accepted', responded_at = now(), accepted_name = ${acceptedName},
        nda_requested = ${ndaRequested}, response_ip_hash = ${ipHash}
      where id = ${id}`
    await tx`update requests set status = 'accepted' where id = ${p.request_id}`

    const [r] = await tx`select * from requests where id = ${p.request_id}`

    // A follow-up inspection adds work to the client's existing project.
    if (r.parent_project_id) {
      const [project] = await tx<{ id: string; code: string }[]>`
        update projects set stage = 'planning', closed_at = null,
          contract_value_kes = coalesce(contract_value_kes, 0) + ${p.total_kes}, payment_status = 'awaiting_payment',
          lead_analyst_id = coalesce(lead_analyst_id, ${p.created_by})
        where id = ${r.parent_project_id} and client_id = ${clientId}
        returning id, code`
      if (project) {
        if (ndaRequested) await tx`update projects set nda_status='requested' where id=${project.id} and nda_status='none'`
        await tx`insert into invoices(project_id,proposal_id,label,amount_kes,deposit_kes,created_by,line_items,due_on) values (${project.id},${p.id},${p.title},${p.total_kes},${p.deposit_kes ?? p.total_kes},${p.created_by ?? clientId},${tx.json(p.line_items ?? [])},current_date + 14)`
        await reconcileProjectPayment(tx,project.id)
        return { project, requestId: p.request_id as string, proposal: p, followUp: true }
      }
    }

    const retainer = r.service_code === 'project_monitoring' && (r.addon_codes as string[]).includes('recurring_setup')
    const [project] = await tx<{ id: string; code: string }[]>`
      insert into projects (client_id, request_id, proposal_id, title, service_code, service_name, engagement,
        location_label, location_lat, location_lng, claims, concerns, contract_value_kes, lead_analyst_id)
      values (${clientId}, ${r.id}, ${p.id}, ${p.title}, ${r.service_code}, ${r.service_name},
        ${retainer ? 'retainer' : 'one_off'}, ${r.location_label}, ${r.location_lat}, ${r.location_lng},
        ${r.claims}, ${r.concerns}, ${p.total_kes}, ${r.owner_id ?? p.created_by})
      returning id, code`
    if (ndaRequested) await tx`update projects set nda_status='requested' where id=${project.id}`
    await tx`insert into invoices(project_id,proposal_id,label,amount_kes,deposit_kes,created_by,line_items,due_on) values (${project.id},${p.id},${p.title},${p.total_kes},${p.deposit_kes ?? p.total_kes},${p.created_by ?? clientId},${tx.json(p.line_items ?? [])},current_date + 14)`
    await reconcileProjectPayment(tx,project.id)
    if (r.location_lat != null && r.location_lng != null) await tx`insert into project_sites(project_id,label,lat,lng,primary_site) values (${project.id},${r.location_label ?? 'Primary site'},${r.location_lat},${r.location_lng},true)`
    for (const location of (r.additional_locations ?? []) as {label:string;lat:number;lng:number}[]) await tx`insert into project_sites(project_id,label,lat,lng) values (${project.id},${location.label},${location.lat},${location.lng})`
    return { project, requestId: p.request_id as string, proposal: p, followUp: false }
  })
}

export async function declineProposal(id: string, clientId: string, reason: string | null, ipHash: string) {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.actor_id',${clientId},true),set_config('app.ip_hash',${ipHash},true)`
    const [p] = await tx<(ProposalRow & { client_id: string })[]>`
      select p.*, r.client_id from proposals p join requests r on r.id = p.request_id where p.id = ${id} for update of p`
    if (!p || p.client_id !== clientId) throw new Error('Proposal not found.')
    const [request] = await tx`select status from requests where id=${p.request_id} for update`
    if (request?.status !== 'proposal_sent') throw new Error('The request is no longer open for a response.')
    if (p.status !== 'sent') throw new Error('This proposal is no longer open.')
    await tx`
      update proposals set status = 'declined', responded_at = now(), decline_reason = ${reason}, response_ip_hash = ${ipHash}
      where id = ${id}`
    await tx`update requests set status = 'declined' where id = ${p.request_id}`
    return p
  })
}
