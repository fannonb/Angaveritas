import Link from 'next/link'
import type { ProposalRow } from '@/lib/data/proposals'
import { proposalStatusLabels } from '@/lib/labels'
import { site } from '@/lib/site'
import { fmtDate, fmtDateTime, kes } from './format'

// The scope of work, price and terms, as the client sees and signs it.
export default function ProposalView({ p, reference, clientName, tz }: { p: ProposalRow; reference: string; clientName: string; tz?: string }) {
  return (
    <article className="panel">
      <div className="panel-head">
        <div>
          <p className="kicker">Proposal {reference} · version {p.version}</p>
          <h2 className="mt-1 text-xl">{p.title}</h2>
        </div>
        <span className="chip chip--plain chip--none">{proposalStatusLabels[p.status]}</span>
      </div>
      <div className="panel-pad space-y-6">
        <dl className="kv">
          <dt>Prepared for</dt>
          <dd>{clientName}</dd>
          <dt>Issued</dt>
          <dd>{fmtDate(p.sent_at ?? p.created_at, tz)}</dd>
          {p.valid_until && (<><dt>Valid until</dt><dd>{fmtDate(p.valid_until, tz)}</dd></>)}
          <dt>Timeline</dt>
          <dd>{p.timeline}</dd>
        </dl>

        <section>
          <h3 className="text-base">What this work will answer</h3>
          <p className="prose-text mt-2">{p.objectives}</p>
        </section>

        {p.scope_items.length > 0 && (
          <section>
            <h3 className="text-base">Scope of work</h3>
            <ul className="checklist checklist--plain mt-3">{p.scope_items.map((s) => <li key={s}>{s}</li>)}</ul>
          </section>
        )}

        {p.deliverables.length > 0 && (
          <section>
            <h3 className="text-base">What you receive</h3>
            <ul className="checklist mt-3">{p.deliverables.map((s) => <li key={s}>{s}</li>)}</ul>
          </section>
        )}

        {p.exclusions && (
          <section>
            <h3 className="text-base">Not included</h3>
            <p className="prose-text mt-2">{p.exclusions}</p>
          </section>
        )}

        <section>
          <h3 className="text-base">Price</h3>
          <div className="table-scroll mt-3">
            <table className="table">
              <tbody>
                {p.line_items.map((l, i) => (
                  <tr key={i}>
                    <td>
                      {l.label}
                      {l.detail && <span className="block text-sm text-muted">{l.detail}</span>}
                    </td>
                    <td className="num text-right">{kes(l.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">Total</th>
                  <td className="num text-right text-lg font-semibold">{kes(p.total_kes)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="hint mt-2">About USD {(Math.round(p.total_kes / site.usdRate / 5) * 5).toLocaleString('en-US')}. Invoiced in Kenya Shillings.</p>
        </section>

        <section>
          <h3 className="text-base">Payment</h3>
          <p className="prose-text mt-2">{p.payment_terms}</p>
          <p className="hint mt-2">To pay before the site visit: {kes(p.deposit_kes ?? p.total_kes)}.</p>
        </section>

        <p className="text-sm text-ink-2">
          This proposal is subject to the AngaVeritas <Link href="/terms" target="_blank">Terms of Service</Link> (version {p.terms_version}).
          {p.nda_offered ? ' A separate non-disclosure agreement is available on request.' : ''}
        </p>

        {p.status === 'accepted' && (
          <p className="alert alert-ok">
            Accepted and signed by <strong>{p.accepted_name}</strong> on {fmtDateTime(p.responded_at, tz)}
            {p.nda_requested ? '. NDA requested.' : '.'}
          </p>
        )}
        {p.status === 'declined' && (
          <p className="alert alert-warn">
            Declined on {fmtDateTime(p.responded_at, tz)}
            {p.decline_reason ? `: ${p.decline_reason}` : '.'}
          </p>
        )}
      </div>
    </article>
  )
}
