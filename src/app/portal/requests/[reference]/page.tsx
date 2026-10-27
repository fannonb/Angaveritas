import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RequestChip, Timeline } from '@/components/app/bits'
import { fmtDate, kes } from '@/components/app/format'
import Messages from '@/components/app/Messages'
import ProposalView from '@/components/app/ProposalView'
import RequestSummary from '@/components/app/RequestSummary'
import { requireClient } from '@/lib/auth/session'
import { listMessages, markRead } from '@/lib/data/messages'
import { requestEvents } from '@/lib/data/projects'
import { currentClientProposal } from '@/lib/data/proposals'
import { getRequestForClient } from '@/lib/data/requests'
import { clientMessageAction, withdrawRequestAction } from '../../actions'
import ProposalResponse from './ProposalResponse'

export const metadata = { title: 'Request' }

const nextStep: Record<string, string> = {
  submitted: 'We review the scope and send you a formal proposal, usually within one business day.',
  in_review: 'An analyst is reviewing your request. Expect a proposal or a question from us shortly.',
  proposal_sent: 'Your proposal is ready below. Accept it to start the work, or message us with questions.',
  accepted: 'Accepted. Your project is open: tell us about the site there so we can plan the visit.',
  declined: 'You declined this proposal. Message us if you would like a revised one.',
  withdrawn: 'You withdrew this request.',
  closed: 'This request is closed.',
}

export default async function RequestPage({ params: paramsPromise, searchParams: searchParamsPromise }: { params: Promise<{ reference: string }>; searchParams: Promise<{ new?: string }> }) {
  const params = await paramsPromise
  const searchParams = await searchParamsPromise
  const user = await requireClient()
  const r = await getRequestForClient(params.reference, user.id)
  if (!r) notFound()
  const [proposal, messages, events] = await Promise.all([currentClientProposal(r.id), listMessages({ requestId: r.id }, false), requestEvents(r.id, true)])
  await markRead({ requestId: r.id }, user.id)
  const open = ['submitted', 'in_review', 'proposal_sent'].includes(r.status)

  return (
    <div className="space-y-6">
      <p className="text-sm"><Link href="/portal/projects">← All projects</Link></p>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="kicker">{r.reference} · submitted {fmtDate(r.created_at, user.timezone)}</p>
          <h1 className="app-title mt-1">{r.title}</h1>
          {r.parent_project_code && <p className="mt-1 text-ink-2">Follow-up for project <Link href={`/portal/projects/${r.parent_project_code}`}>{r.parent_project_code}</Link></p>}
        </div>
        <RequestChip status={r.status} client />
      </div>

      {searchParams.new && (
        <p className="alert alert-ok">
          <strong>Request received.</strong> We&apos;ve emailed you a confirmation. We review the scope and send a formal proposal here, usually within one
          business day. Nothing is charged until you accept it.
        </p>
      )}

      {proposal?.status === 'sent' && r.status === 'proposal_sent' ? (
        <section className="decision" aria-labelledby="decision-title">
          <div>
            <p className="decision__label">Your proposal is ready</p>
            <h2 id="decision-title" className="decision__total">{kes(proposal.total_kes)}</h2>
            <dl className="decision__facts">
              <div><dt>Due before the site visit</dt><dd>{kes(proposal.deposit_kes ?? proposal.total_kes)}</dd></div>
              {proposal.valid_until && <div><dt>Valid until</dt><dd>{fmtDate(proposal.valid_until, user.timezone)}</dd></div>}
              <div><dt>Charged</dt><dd>Only after you accept</dd></div>
            </dl>
          </div>
          <div className="decision__actions">
            <a className="btn btn-primary" href="#respond">Review and accept</a>
            <a className="btn btn-secondary" href="#messages">Ask a question</a>
          </div>
        </section>
      ) : (
        <section className="panel panel-pad flex flex-wrap items-center justify-between gap-3">
          <p><strong>Next step:</strong> {nextStep[r.status]}</p>
          {r.project_code && <Link className="btn btn-primary btn-small" href={`/portal/projects/${r.project_code}`}>Open project {r.project_code}</Link>}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <div className="space-y-6">
          {proposal && <ProposalView p={proposal} reference={r.reference} clientName={user.full_name} tz={user.timezone} />}
          {proposal?.status === 'sent' && r.status === 'proposal_sent' && (
            <ProposalResponse proposalId={proposal.id} clientName={user.full_name} total={kes(proposal.total_kes)} verified={!!user.email_verified_at} />
          )}
          <RequestSummary r={r} />
        </div>
        <div className="space-y-6">
          <section className="panel" id="messages">
            <div className="panel-head"><h2>Messages</h2></div>
            <div className="panel-pad">
              <Messages messages={messages} viewerId={user.id} tz={user.timezone} action={clientMessageAction} hidden={{ requestId: r.id }} />
            </div>
          </section>
          <section className="panel">
            <div className="panel-head"><h2>History</h2></div>
            <div className="panel-pad"><Timeline events={events} tz={user.timezone} /></div>
          </section>
          {open && (
            <form action={withdrawRequestAction} className="text-right">
              <input type="hidden" name="requestId" value={r.id} />
              <button className="linkish text-sm text-muted" type="submit">Withdraw this request</button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
