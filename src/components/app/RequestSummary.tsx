import Breakdown from '@/components/Breakdown'
import type { RequestRow } from '@/lib/data/requests'
import { complexityQuestions } from '@/lib/pricing/questions'
import { site } from '@/lib/site'

/** What the client asked for: their brief and the estimate as calculated at the time. */
export default function RequestSummary({ r }: { r: RequestRow }) {
  return (
    <div className="space-y-6">
      <section className="panel panel-pad">
        <h2 className="text-lg">The brief</h2>
        <dl className="kv mt-3">
          <dt>Service</dt>
          <dd>{r.service_name ?? (r.kind === 'follow_up' ? 'Follow-up visit' : 'Custom request')}</dd>
          <dt>Location</dt>
          <dd>
            {r.location_label ?? 'To be confirmed'}
            {r.distance_km_round_trip && r.distance_method !== 'none' ? ` (${r.distance_km_round_trip} km round trip${r.distance_method === 'estimate' ? ', estimated' : ''})` : ''}
          </dd>
          {r.description && (<><dt>The project</dt><dd>{r.description}</dd></>)}
          {r.claims && (<><dt>What to verify</dt><dd>{r.claims}</dd></>)}
          {r.concerns && (<><dt>Main concerns</dt><dd>{r.concerns}</dd></>)}
          {r.investment_band && (<><dt>Investment size</dt><dd>{r.investment_band}</dd></>)}
          {r.decision_timeline && (<><dt>Decision needed</dt><dd>{r.decision_timeline}</dd></>)}
          {r.complexity_answers?.map((a, i) => (
            <Pair key={i} term={complexityQuestions[i].question} value={complexityQuestions[i].options[a - 1]} />
          ))}
        </dl>
      </section>
      {r.breakdown && (
        <section className="panel panel-pad">
          <h2 className="text-lg">Estimate at the time of request</h2>
          <Breakdown result={r.breakdown} usdRate={site.usdRate} />
          <p className="hint mt-3">An estimate, not a quote. The binding price is the one in the proposal.</p>
        </section>
      )}
    </div>
  )
}

function Pair({ term, value }: { term: string; value?: string }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{value ?? '—'}</dd>
    </>
  )
}
