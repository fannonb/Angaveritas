import { logEvent, notifyTeam } from '@/lib/activity'
import { registerClient, signInWithPassword } from '@/lib/auth/account'
import { getUser, isStaff, type SessionUser } from '@/lib/auth/session'
import { sql } from '@/lib/db'
import { getActivePricing } from '@/lib/data/pricing'
import { createRequest, recentRequestsFromIp } from '@/lib/data/requests'
import { sendEmail } from '@/lib/email'
import { inKenya, roadDistance } from '@/lib/geo'
import { computeQuote, formatKes, PricingError, type QuoteResult } from '@/lib/pricing/engine'
import type { ComplexityAnswers } from '@/lib/pricing/questions'
import { clientIp, hashIp, json, sameOrigin } from '@/lib/request'
import { requestSubmitSchema } from '@/lib/validation'

// Submits a request from the calculator. Signs the visitor in (or creates
// their account) first if needed. The price is always recalculated here from
// the active pricing version; numbers sent by the browser are never trusted.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Invalid request.' }, 403)
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request.' }, 400)
  }
  const parsed = requestSubmitSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return json({ error: first?.message ?? 'Please check the form.', field: first?.path.join('.') }, 422)
  }
  const data = parsed.data
  if (data.website) return json({ ok: true, url: '/' }) // bot

  const ipHash = hashIp(clientIp(req))
  if ((await recentRequestsFromIp(ipHash, 60)) >= 10) return json({ error: 'Too many requests from your connection. Please try again later or email us.' }, 429)
  if (data.location && !inKenya(data.location.lat, data.location.lng)) return json({ error: 'Please choose a location in Kenya.', field: 'location' }, 422)
  if (data.additionalLocations?.some(p => !inKenya(p.lat,p.lng))) return json({error:'All sites must be in Kenya.'},422)
  if (data.siteCount && data.answers) data.answers[0] = data.siteCount === 1 ? 1 : data.siteCount <= 3 ? 2 : 3

  // Who is asking
  let user = await getUser()
  if (!user) {
    if (!data.account) return json({ error: 'Please create an account or sign in to submit.', field: 'account' }, 401)
    const result =
      data.account.mode === 'register'
        ? await registerClient({ ...data.account, basedIn: data.account.basedIn })
        : await signInWithPassword(data.account.email, data.account.password)
    if (!result.ok) return json({ error: result.error, field: `account.${result.field ?? ''}` }, 422)
    // The new session cookie isn't visible to this request yet, so load the user directly.
    const [u] = await sql<SessionUser[]>`
      select id, email, full_name, role, phone, based_in, timezone, email_verified_at from users where id = ${result.user.id}`
    user = u ?? null
  }
  if (!user) return json({ error: 'Please sign in again.' }, 401)
  if (isStaff(user)) return json({ error: 'Staff accounts cannot submit client requests. Sign in with a client account.' }, 403)

  // Follow-up on an existing project
  let parentProjectId: string | null = null
  if (data.parentProjectCode) {
    const [p] = await sql<{ id: string }[]>`select id from projects where code = ${data.parentProjectCode} and client_id = ${user.id}`
    if (!p) return json({ error: 'Project not found.' }, 404)
    parentProjectId = p.id
  }

  const pricing = await getActivePricing()
  let result: QuoteResult | null = null
  let distance: { oneWayKm: number; roundTripKm: number; method: 'road' | 'estimate' | 'none' } | null = null
  if (data.kind === 'estimate') {
    distance = data.location ? await roadDistance(pricing.config.origin, data.location) : { oneWayKm: 0, roundTripKm: 0, method: 'none' }
    const additional = await Promise.all((data.additionalLocations ?? []).map(p => roadDistance(pricing.config.origin,p)))
    try {
      result = computeQuote(
        {
          serviceCode: data.serviceCode!,
          roundTripKm: distance.roundTripKm,
          answers: data.answers as ComplexityAnswers,
          addonCodes: data.addonCodes ?? [],
          urgencyCode: data.urgencyCode!,
          siteCount: data.siteCount,
          additionalRoundTripKm: additional.map(d => d.roundTripKm),
        },
        pricing.config,
      )
    } catch (err) {
      if (err instanceof PricingError) return json({ error: err.message }, 422)
      throw err
    }
  }

  const saved = await createRequest({
    clientId: user.id,
    kind: parentProjectId ? 'follow_up' : data.kind,
    parentProjectId,
    ...data.brief,
    serviceCode: result?.service.code ?? null,
    serviceName: result?.service.name ?? null,
    location: data.location,
    distance,
    answers: data.kind === 'estimate' ? data.answers : null,
    addonCodes: data.kind === 'estimate' ? data.addonCodes : [],
    urgencyCode: data.kind === 'estimate' ? data.urgencyCode : null,
    result,
    additionalLocations: data.additionalLocations ?? [],
    pricingVersionId: pricing.id,
    ipHash,
  })

  const price = result ? (result.totalMax ? `${formatKes(result.total)} – ${formatKes(result.totalMax)}` : formatKes(result.total)) : 'custom quote'
  await logEvent({
    actorId: user.id,
    requestId: saved.id,
    projectId: parentProjectId,
    type: 'request.submitted',
    summary: `Request ${saved.reference} submitted${result ? ` (estimate ${price})` : ''}`,
    clientVisible: true,
    ipHash,
  })
  await notifyTeam({
    title: `New request ${saved.reference}: ${data.brief.title}`,
    body: [
      `${user.full_name} (${user.email}${user.phone ? `, ${user.phone}` : ''})`,
      `Service: ${result?.service.name ?? (parentProjectId ? 'Follow-up' : 'Custom')}`,
      `Location: ${data.location?.label ?? 'not given'}`,
      `Estimate: ${price}`,
      data.brief.decisionTimeline ? `Decision timeline: ${data.brief.decisionTimeline}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    href: `/staff/requests/${saved.reference}`,
  })
  await sendEmail({
    to: user.email,
    subject: `We've received your request ${saved.reference}`,
    text: [
      `Hello ${user.full_name.split(' ')[0]},`,
      '',
      `Thank you. Your request "${data.brief.title}" (${saved.reference}) is with our team.`,
      result ? `Your estimate: ${price}. This is not yet a binding price.` : '',
      '',
      'What happens next: we review the scope and reply within one business day with a formal proposal you can accept online. Nothing is charged until you accept it.',
    ]
      .filter((l) => l !== '')
      .join('\n'),
  })

  return json({ ok: true, reference: saved.reference, url: `/portal/requests/${saved.reference}?new=1` }, 201)
}
