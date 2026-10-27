import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RequestChip, Timeline } from '@/components/app/bits'
import { fmtDate, fmtDateTime, kes } from '@/components/app/format'
import Messages from '@/components/app/Messages'
import ProposalView from '@/components/app/ProposalView'
import RequestSummary from '@/components/app/RequestSummary'
import { requireStaff } from '@/lib/auth/session'
import { listMessages, markRead } from '@/lib/data/messages'
import { requestEvents } from '@/lib/data/projects'
import { listProposals, type LineItem } from '@/lib/data/proposals'
import { getRequestByReference, type RequestWithClient } from '@/lib/data/requests'
import { listAssignableStaff } from '@/lib/data/users'
import { standardDeliverables } from '@/lib/pricing/questions'
import { services } from '@/site/services'
import { requestStatusTargets, staffRequestNextStep } from '@/lib/workflow'
import { claimRequestAction, deleteDraftAction, qualifyAction, requestStatusAction, staffMessageAction } from '../../actions'
import ProposalBuilder, { type ProposalDefaults } from './ProposalBuilder'

export const metadata = { title: 'Request' }

/** First draft of a proposal, built from what the client entered in the calculator. */
function defaultsFromRequest(r: RequestWithClient): ProposalDefaults {
  const b = r.breakdown
  const items: LineItem[] = []
  if (b) {
    items.push({ label: `${b.service.name}: professional fee`, detail: `${b.complexity.tierName} scope`, amount: b.complexity.adjustedFee })
    if (b.travel.total > 0) items.push({ label: 'Travel & mobilization', detail: `${b.travel.roundTripKm} km round trip from Nairobi`, amount: b.travel.total })
    for (const a of b.addons) items.push({ label: a.name, detail: a.unit, amount: a.price })
    if (b.multiSite?.amount) items.push({label:'Additional site fees',detail:`${b.multiSite.count-1} additional sites`,amount:b.multiSite.amount})
    if (b.urgency.amount > 0) items.push({ label: `${b.urgency.name} delivery`, detail: `${b.urgency.pct}% surcharge`, amount: b.urgency.amountMax ?? b.urgency.amount })
  }
  const service = services.find((s) => s.calculatorCode === r.service_code)
  const claims = (r.claims ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  const valid = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10)
  return {
    title: r.title,
    objectives: [
      r.kind === 'follow_up' ? 'A follow-up inspection to establish what has changed since our last visit.' : `To give you an independent, evidence-based view of “${r.title}” before you commit further capital.`,
      r.concerns ? `In particular: ${r.concerns}` : '',
    ].filter(Boolean).join('\n\n'),
    scope: [...(service?.checks ?? []), ...claims.map((c) => `Verify: ${c}`)].join('\n'),
    deliverables: [...standardDeliverables, ...(b?.addons.map((a) => a.name) ?? [])].join('\n'),
    exclusions: 'Legal title searches, cadastral surveys, structural engineering opinions and financial audits are outside this scope. We will tell you if you need one.',
    timeline: b ? `${b.urgency.name}: report within ${b.urgency.delivery} of the site visit` : 'Report within 5–10 business days of the site visit',
    lineItems: items,
    paymentTerms: 'Payment in full before the site visit is scheduled, by M-Pesa or bank transfer. Payment details are on the invoice we send after you accept.',
    validUntil: valid,
    ndaOffered: true,
  }
}

export default async function StaffRequest({ params: paramsPromise }: { params: Promise<{ reference: string }> }) {
  const params = await paramsPromise
  const user = await requireStaff(['analyst', 'admin'])
  const r = await getRequestByReference(params.reference)
  if (!r) notFound()
  const [proposals, messages, events, staff] = await Promise.all([listProposals(r.id), listMessages({ requestId: r.id }, true), requestEvents(r.id, false), listAssignableStaff()])
  await markRead({ requestId: r.id }, user.id)
  const draft = proposals.find((p) => p.status === 'draft')
  const latestSent = proposals.find((p) => p.status !== 'draft')
  const canPropose = ['submitted', 'in_review', 'proposal_sent', 'declined'].includes(r.status)
  const statusTargets = requestStatusTargets(r.status)
  const next = staffRequestNextStep(r, !!draft)

  const defaults: ProposalDefaults = draft
    ? {
        draftId: draft.id,
        title: draft.title,
        objectives: draft.objectives,
        scope: draft.scope_items.join('\n'),
        deliverables: draft.deliverables.join('\n'),
        exclusions: draft.exclusions ?? '',
        timeline: draft.timeline,
        lineItems: draft.line_items,
        paymentTerms: draft.payment_terms,
        validUntil: draft.valid_until ?? '',
        ndaOffered: draft.nda_offered,
        depositKes: draft.deposit_kes,
      }
    : latestSent
      ? {
          title: latestSent.title,
          objectives: latestSent.objectives,
          scope: latestSent.scope_items.join('\n'),
          deliverables: latestSent.deliverables.join('\n'),
          exclusions: latestSent.exclusions ?? '',
          timeline: latestSent.timeline,
          lineItems: latestSent.line_items,
          paymentTerms: latestSent.payment_terms,
          validUntil: new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10),
          ndaOffered: latestSent.nda_offered,
          depositKes: latestSent.deposit_kes,
        }
      : defaultsFromRequest(r)

  return (
    <div className="space-y-6">
      <p className="text-sm"><Link href="/staff/requests">← Requests</Link></p>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="kicker">{r.reference} · received {fmtDateTime(r.created_at)}{r.kind === 'follow_up' ? ` · follow-up for ${r.parent_project_code}` : ''}</p>
          <h1 className="app-title mt-1">{r.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RequestChip status={r.status} />
          {r.project_code && <Link className="btn btn-primary btn-small" href={`/staff/projects/${r.project_code}`}>Project {r.project_code}</Link>}
        </div>
      </div>

      <section className="next-step" aria-label="Next step">
        <div>
          <p className="next-step__label">Next step</p>
          <p className="next-step__title">{next.title}</p>
          <p className="next-step__text">{next.text}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {next.action === 'take' && (
            <form action={claimRequestAction}>
              <input type="hidden" name="requestId" value={r.id} />
              <button className="btn btn-primary btn-small" type="submit">Take this request</button>
            </form>
          )}
          {next.action === 'start' && (
            <form action={requestStatusAction}>
              <input type="hidden" name="requestId" value={r.id} />
              <button className="btn btn-primary btn-small" name="status" value="in_review" type="submit">Start the review</button>
            </form>
          )}
          {next.action === 'proposal' && canPropose && <a className="btn btn-primary btn-small" href="#proposal">Go to the proposal</a>}
          {next.action === 'message' && <a className="btn btn-secondary btn-small" href="#messages">Message the client</a>}
          {next.action === 'project' && r.project_code && <Link className="btn btn-primary btn-small" href={`/staff/projects/${r.project_code}`}>Open project {r.project_code}</Link>}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr] xl:items-start">
        <div className="space-y-6">
          {latestSent && (canPropose ? <ProposalView p={latestSent} reference={r.reference} clientName={r.client_name} /> : <details className="panel"><summary className="panel-head cursor-pointer"><h2>Agreed proposal · v{latestSent.version}</h2><span className="text-sm text-muted">{kes(latestSent.total_kes)} · view full terms</span></summary><div className="panel-pad"><ProposalView p={latestSent} reference={r.reference} clientName={r.client_name} /></div></details>)}
          {canPropose && (!!draft || !latestSent ? (
            <section className="panel" id="proposal">
              <div className="panel-head">
                <h2>{draft ? `Proposal draft (v${draft.version})` : 'Write the proposal'}</h2>
                {draft && (
                  <form action={deleteDraftAction}>
                    <input type="hidden" name="proposalId" value={draft.id} />
                    <button className="linkish text-sm text-muted" type="submit">Discard draft</button>
                  </form>
                )}
              </div>
              <div className="panel-pad">
                {!draft && !latestSent && <p className="alert alert-ok mb-5">Pre-filled from the client&apos;s estimate and brief. Check the scope and price, then send.</p>}
                <ProposalBuilder requestId={r.id} d={defaults} />
              </div>
            </section>
          ) : (
            <details className="panel" id="proposal" open={r.status === 'declined'}>
              <summary className="panel-head cursor-pointer list-none">
                <h2>Revise the proposal</h2>
                <span className="text-sm text-muted">Change the scope or price</span>
              </summary>
              <div className="panel-pad">
                <p className="hint mb-5">Sending a revision replaces v{latestSent?.version} for the client. The earlier version stays in the history.</p>
                <ProposalBuilder requestId={r.id} d={defaults} />
              </div>
            </details>
          ))}
          {proposals.filter((p) => p !== latestSent && p !== draft).length > 0 && (
            <section className="panel panel-pad">
              <h2 className="text-base">Earlier versions</h2>
              <ul className="mt-2 text-sm text-ink-2">
                {proposals.filter((p) => p !== latestSent && p !== draft).map((p) => <li key={p.id}>v{p.version} · {kes(p.total_kes)} · {p.status} · {fmtDate(p.sent_at ?? p.created_at)}</li>)}
              </ul>
            </section>
          )}
          {canPropose ? <RequestSummary r={r} /> : <details className="panel"><summary className="panel-head cursor-pointer"><h2>Original enquiry & estimate</h2></summary><div className="panel-pad"><RequestSummary r={r} /></div></details>}
        </div>

        <div className="space-y-6">
          <section className="panel panel-pad space-y-3">
            <h2 className="text-lg">Client</h2>
            <dl className="kv">
              <dt>Name</dt><dd><Link href={`/staff/clients/${r.client_id}`}>{r.client_name}</Link></dd>
              <dt>Email</dt><dd><a href={`mailto:${r.client_email}`}>{r.client_email}</a></dd>
              <dt>Phone</dt><dd>{r.client_phone ? <a href={`tel:${r.client_phone.replace(/[^\d+]/g, '')}`}>{r.client_phone}</a> : '—'}</dd>
              <dt>Based in</dt><dd>{r.client_based_in ?? '—'}</dd>
            </dl>
          </section>

          <section className="panel panel-pad space-y-3">
            <h2 className="text-lg">Owner and priority</h2>
            <form action={qualifyAction} className="space-y-3">
              <input type="hidden" name="requestId" value={r.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="label">
                  Owner
                  <select className="input" name="ownerId" defaultValue={r.owner_id ?? ''}>
                    <option value="">Nobody yet</option>
                    {staff.filter((s) => s.role !== 'field_agent').map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </label>
                <label className="label">
                  Priority
                  <select className="input" name="priority" defaultValue={r.priority ?? ''}>
                    <option value="">Not set</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                  </select>
                </label>
              </div>
              <button className="btn btn-secondary btn-small" type="submit">Save{r.status === 'submitted' ? ' and start the review' : ''}</button>
            </form>
            {!r.owner_id && r.status !== 'submitted' && (
              <form action={claimRequestAction}>
                <input type="hidden" name="requestId" value={r.id} />
                <button className="linkish text-sm" type="submit">Assign it to me</button>
              </form>
            )}
            <p className="hint">{r.owner_name ? `${r.owner_name} owns this request and leads the project if the client accepts.` : 'Nobody owns it yet. Whoever sends the proposal becomes the owner.'}</p>
            {statusTargets.includes('closed') && (
              <details className="border-0 border-t border-solid border-line pt-3">
                <summary className="cursor-pointer text-sm font-semibold">Close this request</summary>
                <form action={requestStatusAction} className="mt-2 space-y-2">
                  <input type="hidden" name="requestId" value={r.id} />
                  <p className="hint">For when the client is not going ahead.{r.project_code ? ' The project carries on separately.' : ' The client is told.'}</p>
                  <button className="btn btn-danger btn-small" name="status" value="closed" type="submit">Close request</button>
                </form>
              </details>
            )}
          </section>

          <section className="panel" id="messages">
            <div className="panel-head"><h2>Messages with the client</h2></div>
            <div className="panel-pad">
              <Messages messages={messages} viewerId={user.id} action={staffMessageAction} hidden={{ requestId: r.id }} staff emptyText="No messages yet. Ask the client anything you need to scope the work." />
            </div>
          </section>

          <details className="panel">
            <summary className="panel-head cursor-pointer"><h2>History</h2></summary>
            <div className="panel-pad"><Timeline events={events} staff /></div>
          </details>
        </div>
      </div>
    </div>
  )
}
