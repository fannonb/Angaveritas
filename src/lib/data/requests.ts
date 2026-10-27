import 'server-only'
import { sql } from '@/lib/db'
import type { RequestStatus } from '@/lib/labels'
import type { QuoteResult } from '@/lib/pricing/engine'

export type RequestRow = {
  id: string
  reference: string
  client_id: string
  kind: 'estimate' | 'custom' | 'follow_up'
  status: RequestStatus
  parent_project_id: string | null
  title: string
  description: string | null
  claims: string | null
  concerns: string | null
  investment_band: string | null
  decision_timeline: string | null
  service_code: string | null
  service_name: string | null
  location_label: string | null
  location_lat: number | null
  location_lng: number | null
  distance_km_one_way: string | null
  distance_km_round_trip: string | null
  distance_method: string | null
  complexity_answers: number[] | null
  complexity_score: number | null
  complexity_tier: string | null
  addon_codes: string[]
  urgency_code: string | null
  breakdown: QuoteResult | null
  total_kes: number | null
  total_kes_max: number | null
  pricing_version_id: number | null
  priority: 'high' | 'normal' | 'low' | null
  owner_id: string | null
  created_at: Date
  updated_at: Date
}

export type RequestWithClient = RequestRow & {
  client_name: string
  client_email: string
  client_phone: string | null
  client_based_in: string | null
  owner_name: string | null
  project_id: string | null
  project_code: string | null
  parent_project_code: string | null
}

export type NewRequest = {
  clientId: string
  kind: RequestRow['kind']
  parentProjectId?: string | null
  title: string
  description?: string | null
  claims?: string | null
  concerns?: string | null
  investmentBand?: string | null
  decisionTimeline?: string | null
  serviceCode?: string | null
  serviceName?: string | null
  location?: { label: string; lat: number; lng: number } | null
  distance?: { oneWayKm: number; roundTripKm: number; method: 'road' | 'estimate' | 'none' } | null
  answers?: number[] | null
  addonCodes?: string[]
  urgencyCode?: string | null
  result?: QuoteResult | null
  pricingVersionId?: number | null
  ipHash?: string | null
  additionalLocations?: { label: string; lat: number; lng: number }[]
}

export async function createRequest(r: NewRequest) {
  const [row] = await sql<{ id: string; reference: string }[]>`
    insert into requests (
      client_id, kind, parent_project_id, title, description, claims, concerns, investment_band, decision_timeline,
      service_code, service_name, location_label, location_lat, location_lng,
      distance_km_one_way, distance_km_round_trip, distance_method,
      complexity_answers, complexity_score, complexity_tier, addon_codes, urgency_code,
      breakdown, total_kes, total_kes_max, pricing_version_id, ip_hash, additional_locations
    ) values (
      ${r.clientId}, ${r.kind}, ${r.parentProjectId ?? null}, ${r.title}, ${r.description ?? null}, ${r.claims ?? null},
      ${r.concerns ?? null}, ${r.investmentBand ?? null}, ${r.decisionTimeline ?? null},
      ${r.serviceCode ?? null}, ${r.serviceName ?? null},
      ${r.location?.label ?? null}, ${r.location?.lat ?? null}, ${r.location?.lng ?? null},
      ${r.distance?.oneWayKm ?? null}, ${r.distance?.roundTripKm ?? null}, ${r.distance?.method ?? null},
      ${r.answers ?? null}, ${r.result?.complexity.score ?? null}, ${r.result?.complexity.tier ?? null},
      ${r.addonCodes ?? []}, ${r.urgencyCode ?? null},
      ${r.result ? sql.json(r.result as never) : null}, ${r.result?.total ?? null}, ${r.result?.totalMax ?? null},
      ${r.pricingVersionId ?? null}, ${r.ipHash ?? null}, ${sql.json((r.additionalLocations ?? []) as never)}
    ) returning id, reference`
  return row
}

export async function recentRequestsFromIp(ipHash: string, minutes: number) {
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from requests where ip_hash = ${ipHash} and created_at > now() - make_interval(mins => ${minutes})`
  return row.n
}

const withClient = () => sql`
  select r.*, c.full_name as client_name, c.email as client_email, c.phone as client_phone, c.based_in as client_based_in,
    o.full_name as owner_name, p.id as project_id, p.code as project_code, pp.code as parent_project_code
  from requests r
  join users c on c.id = r.client_id
  left join users o on o.id = r.owner_id
  left join projects p on p.request_id = r.id
  left join projects pp on pp.id = r.parent_project_id`

export async function listRequestsForClient(clientId: string) {
  return sql<RequestWithClient[]>`${withClient()} where r.client_id = ${clientId} order by r.created_at desc`
}

export async function getRequestForClient(reference: string, clientId: string) {
  const [row] = await sql<RequestWithClient[]>`${withClient()} where r.reference = ${reference} and r.client_id = ${clientId}`
  return row ?? null
}

export async function getRequestByReference(reference: string) {
  const [row] = await sql<RequestWithClient[]>`${withClient()} where r.reference = ${reference}`
  return row ?? null
}

export async function getRequestById(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const [row] = await sql<RequestWithClient[]>`${withClient()} where r.id = ${id}`
  return row ?? null
}

export const openRequestStatuses: RequestStatus[] = ['submitted', 'in_review', 'proposal_sent']

export async function listRequests(opts: { status?: RequestStatus | 'open' | 'all'; search?: string; clientId?: string; owner?: 'unassigned' | 'me'; viewerId?: string }) {
  const status = opts.status ?? 'open'
  const q = opts.search?.trim() ? `%${opts.search.trim().replace(/[%_]/g, '')}%` : null
  return sql<RequestWithClient[]>`
    ${withClient()}
    where ${status === 'all' ? sql`true` : status === 'open' ? sql`r.status in ${sql(openRequestStatuses)}` : sql`r.status = ${status}`}
      and ${opts.clientId ? sql`r.client_id = ${opts.clientId}` : sql`true`}
      and ${opts.owner === 'unassigned' ? sql`r.owner_id is null` : opts.owner === 'me' && opts.viewerId ? sql`r.owner_id = ${opts.viewerId}` : sql`true`}
      and ${q ? sql`(r.reference ilike ${q} or r.title ilike ${q} or c.full_name ilike ${q} or c.email ilike ${q} or r.location_label ilike ${q})` : sql`true`}
    order by case r.priority when 'high' then 0 when 'normal' then 1 else 2 end, r.created_at desc
    limit 300`
}

export async function requestCounts() {
  const rows = await sql<{ status: RequestStatus; n: number }[]>`select status, count(*)::int as n from requests group by status`
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<RequestStatus, number>>
}

export async function setRequestStatus(id: string, status: RequestStatus) {
  await sql`update requests set status = ${status} where id = ${id}`
}

export async function updateQualification(id: string, q: { priority: 'high' | 'normal' | 'low' | null; ownerId: string | null }) {
  await sql`update requests set priority = ${q.priority}, owner_id = ${q.ownerId} where id = ${id}`
}
