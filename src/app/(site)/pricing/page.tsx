import type { Metadata } from 'next'
import Link from 'next/link'
import { CtaBox, Icon } from '@/components/site/ui'
import { getSiteSettings } from '@/lib/data/settings'
import { site } from '@/lib/site'
import { formatKes, services } from '@/site/services'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'How AngaVeritas prices each service, how travel, project scope and urgency affect your price, and an itemised estimate.',
}

const usd = (kes: number) => `about USD ${Math.round(kes / site.usdRate / 5) * 5}`
const retainer = services.find((s) => s.slug === 'oversight-retainer')!

const estimateSteps = [
  ['Service', 'The starting fee for the work you need.'],
  ['Location', 'Round-trip road distance from Nairobi, priced line by line.'],
  ['Project scope', 'Five plain questions: how many sites, people, documents, how much fieldwork, how detailed a report.'],
  ['Deliverables', 'Everything standard is included; add a drone survey or presentation if you need one.'],
  ['Speed', 'Standard, priority, express or emergency.'],
  ['Review', 'Your itemised estimate. Scope and final price are agreed in a formal proposal.'],
]

export default async function Pricing() {
  const { showPublicPrices: show } = await getSiteSettings()
  return (
    <main>
      <header className="page-head">
        <div className="wrap">
          <h1>Pricing</h1>
          <p className="lead">
            {show ? 'Clear starting fees, an' : 'An'} itemised estimate in a few minutes, and a written proposal you approve before any work starts.
          </p>
          <div className="actions">
            <Link className="btn btn-primary" href="/estimate">Get an estimate <Icon name="arrow" /></Link>
          </div>
        </div>
      </header>

      <section className="section section--snug">
        <div className="wrap">
          <h2 className="mb-md">{show ? 'Starting fees' : 'What it costs'}</h2>
          <ul className="price-list">
            {services.map((s) => (
              <li key={s.slug}>
                <div>
                  <Link href={`/services#${s.slug}`} className="price-list__name">{s.title}</Link>
                  <p>{s.question}</p>
                </div>
                {show ? (
                  <div className="price-list__price">
                    <strong>{formatKes(s.fromKes)}</strong>
                    <span>{s.unit ? `${s.unit}, ` : ''}{usd(s.fromKes)}</span>
                  </div>
                ) : (
                  <Link className="text-link" href={s.calculatorCode ? `/estimate?service=${s.slug}` : `/contact?service=${s.slug}`}>
                    {s.calculatorCode ? 'Get an estimate' : 'Talk to an analyst'}
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <p className="note">
            Every report includes written findings, photos, video, GPS confirmation, confidence ratings and a risk matrix at no
            extra cost. Fees are reviewed periodically; the calculator always uses the current figures.
          </p>
        </div>
      </section>

      <section className="section section--grey">
        <div className="wrap">
          <div className="section-intro section-intro--row">
            <div>
              <h2>Your exact estimate in six steps</h2>
              <p>The same calculation we use for formal quotes, so there are no surprises.</p>
            </div>
            <Link className="btn btn-primary" href="/estimate">Get an estimate</Link>
          </div>
          <ol className="steps steps--3">
            {estimateSteps.map(([t, d]) => <li key={t}><h3>{t}</h3><p>{d}</p></li>)}
          </ol>
          <p className="formula mt-lg">
            Total = [ (<b>Base fee</b> × <b>Project scope</b>) + <b>Travel</b> + <b>Add-ons</b> ] × (1 + <b>Speed surcharge</b>)
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2 className="mb-md">What can change the price</h2>
          <div className="factors">
            <div>
              <h3>Travel</h3>
              <p>We&apos;re based in Nairobi. For sites elsewhere we charge fuel and vehicle costs by round-trip distance, plus a driver and accommodation for long trips. It&apos;s always a separate line on your estimate, and confirmed in the proposal before any work starts.</p>
            </div>
            <div>
              <h3>Project scope</h3>
              <p>
                More sites, people or documents mean more work.{' '}
                {show && 'A standard job multiplies the fee by 1.3, a comprehensive one by 1.7. '}
                We price on effort, never on what your investment is worth.
              </p>
            </div>
            <div>
              <h3>Speed</h3>
              <p>
                {show
                  ? 'Priority (2–5 business days) adds 25%. Express (24–48 hours) adds 50%.'
                  : 'Priority (2–5 business days) and express (24–48 hours) delivery cost more than standard.'}{' '}
                Same-day work is possible only when a team is free.
              </p>
            </div>
            <div>
              <h3>Optional extras</h3>
              <p>Drone surveys, a presentation for your board or lender, or recurring monitoring. Added only if you choose them.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--grey">
        <div className="wrap retainer">
          <div>
            <h2>Need someone watching every month?</h2>
            <p className="lead mt-sm">
              The {retainer.title} gives you scheduled inspections, monthly reports and early warnings,{' '}
              {show ? `from ${formatKes(retainer.fromKes)} per month ` : 'priced '}depending on the number of sites and visits.
            </p>
          </div>
          <Link className="btn btn-secondary" href="/contact?service=oversight-retainer">Discuss a retainer</Link>
        </div>
      </section>

      <CtaBox title="Ready for an exact price?" text="The calculator gives you an itemised estimate in a few minutes, including travel." />
    </main>
  )
}
