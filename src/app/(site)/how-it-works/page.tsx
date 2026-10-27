import type { Metadata } from 'next'
import Link from 'next/link'
import { Chip, CtaBox, EvidencePhoto } from '@/components/site/ui'
import { ConfidenceTable, EvidenceScale, statuses } from '@/components/site/EvidenceFramework'

const steps = [
  ['Consultation', 'We learn what you are trying to decide, what you have been told, and what worries you.'],
  ['Scope and quote', 'We agree exactly what will be checked, the schedule, the report format and an itemised price. Nothing starts until you approve.'],
  ['Preparation', 'Desk research on the area, the people and any records, then a route and checklist for the field team.'],
  ['Fieldwork', 'Site visits with standard checklists: photos, video, GPS, measurements and interviews. We record what we see, not what we expect.'],
  ['Analysis and review', 'Evidence is cross-checked and graded, risks are rated, and the report is reviewed before it is released.'],
  ['Delivery', 'You receive the report and evidence archive, with an optional walkthrough call. Follow-up visits can be scheduled.'],
]

const photos = [
  ['/images/field/field-site-context.webp', 'AV-NAK-P01', 'Site context', 1152, 529],
  ['/images/field/field-farm-entrance.webp', 'AV-NAK-P02', 'Farm entrance', 1148, 504],
  ['/images/field/field-access-road.webp', 'AV-NAK-P03', 'All-weather access road', 960, 630],
  ['/images/field/field-aerial.webp', 'AV-NAK-P04', 'Aerial view', 741, 555],
]

const limits = [
  'We do not guarantee that an investment will succeed.',
  'We do not offer reassurance the evidence does not support.',
  'GPS confirms where we were. It is not a land survey or title search.',
  'We do not replace lawyers, surveyors, engineers, vets or auditors. When you need one, we say so.',
]

export const metadata: Metadata = {
  title: "How it works",
  description: "Our process from first enquiry to final report, how we grade evidence from E1 to E5, confidence ratings, risk statuses and what we will not do.",
}

export default function HowItWorks() {
  return (
    <main>
      <header className="page-head">
        <div className="wrap">
          <h1>How it works</h1>
          <p className="lead">
            A consistent process, so every report can be trusted the same way: what we checked, how,
            how sure we are, and what we could not verify.
          </p>
        </div>
      </header>

      <section className="section">
        <div className="wrap">
          <ol className="steps steps--3">
            {steps.map(([t, d]) => <li key={t}><h3>{t}</h3><p>{d}</p></li>)}
          </ol>
        </div>
      </section>

      <section className="section section--grey" id="evidence">
        <div className="wrap">
          <div className="section-intro">
            <h2>How we grade evidence</h2>
            <p>
              Not all evidence is equal. A photo we took on site counts for more than a claim in a
              business plan. Every source in our reports is graded from E1 to E5.
            </p>
          </div>
          <EvidenceScale />
        </div>
      </section>

      <section className="section">
        <div className="wrap grid-2">
          <div>
            <h2>Confidence on every finding</h2>
            <p className="lead mt-sm">
              Each key finding carries a rating, so you can see which conclusions are solid and which
              need more work before you rely on them.
            </p>
          </div>
          <ConfidenceTable />
        </div>
      </section>

      <section className="section section--grey">
        <div className="wrap">
          <div className="section-intro">
            <h2>A status for every area, and a clear decision</h2>
            <p>
              Each part of the assessment gets one of three statuses. The report ends with a
              recommended decision, for example <strong>Conditional proceed</strong>: continue, but
              don't commit full capital until named conditions are met.
            </p>
          </div>
          <ul className="status-list">
            {statuses.map(([s, d]) => <li key={s}><Chip status={s} /><p>{d}</p></li>)}
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-intro section-intro--row">
            <div>
              <h2>Every photo answers a question</h2>
              <p>Photos carry an evidence ID and are linked to a specific observation. These are from our sample report.</p>
            </div>
            <Link className="text-link" href="/sample-report">View the sample report</Link>
          </div>
          <div className="cards cards--2">
            {photos.map(([src, id, label, w, h]) => <EvidencePhoto key={id} src={src} id={id} label={label} width={w} height={h} wide />)}
          </div>
        </div>
      </section>

      <section className="section section--grey">
        <div className="wrap grid-2 grid-2--top">
          <div>
            <h2>What we will not do</h2>
            <p className="lead mt-sm">Being clear about our limits is part of what makes our reports reliable.</p>
          </div>
          <ul className="checklist checklist--plain">{limits.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      </section>

      <CtaBox />
    </main>
  )
}
