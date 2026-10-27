import Link from 'next/link'
import DashboardPreview from '@/components/site/DashboardPreview'
import HeroShowcase from '@/components/site/HeroShowcase'
import SampleFinding from '@/components/site/SampleFinding'
import { CtaBox, DownloadReport, Icon, KenyaMap } from '@/components/site/ui'
import { getSiteSettings } from '@/lib/data/settings'
import { faq } from '@/site/faq'
import { formatKes, services, stages } from '@/site/services'

// Facts already stated elsewhere on the site; keep them verifiable.
const facts = [
  { icon: 'calendarCheck', title: 'Report in 5⁠–⁠10 business days', text: 'Faster delivery available' },
  { icon: 'mapPinArea', title: 'Any county in Kenya', text: 'Travel priced from Nairobi' },
  { icon: 'review', title: 'Reviewed before release', text: 'A second person approves every report' },
  { icon: 'message', title: 'Reply within one business day', text: 'Wherever you are based' },
]

// What a remote investor usually relies on, against what a site check gives them.
const compare = [
  ['Photos and updates sent by the seller or contractor', 'Our own photos, video and GPS, taken on site by our field agent'],
  ['Word from relatives, agents or the people you are paying', 'An independent view. We work for you, not for the seller, contractor or project owner'],
  ['A deposit paid on trust', 'A written finding for each question you asked, and a clear recommendation before you pay'],
]

const steps = [
  ['Tell us what to check', 'Describe the land, business or project and where it is. The estimate takes a few minutes.'],
  ['Agree the scope', 'We send a formal proposal. Scope and price are agreed there, before any work starts.'],
  ['We visit the site', 'Our field agent collects photos, video, GPS records and interviews.'],
  ['Get your report', 'A second person reviews it, then you read the findings and recommendation in your dashboard.'],
]

const inReport = [
  'Written findings and recommendation',
  'Geotagged, time-stamped photos',
  'Video walkthrough of the site',
  'Confidence rating on every finding',
  'Risk matrix with required actions',
  'What we could not verify, stated plainly',
]

const dashboard = [
  ['file', 'Accept your proposal online', 'Scope, price and terms in one place, signed when you are ready.'],
  ['camera', 'See the evidence as it is released', 'Photos, video and findings appear once they have been reviewed.'],
  ['message', 'Talk to your analyst', 'Questions and answers stay with the project, not in your inbox.'],
]

const principles = [
  ['shield', 'Independent', 'We work for you, not for the seller, contractor or project owner.'],
  ['camera', 'Evidence first', 'Photos and video carry GPS and capture time, and every file is fingerprinted when it is uploaded.'],
  ['review', 'Checked twice', 'Someone other than the field agent reviews each visit, and a second person approves each report.'],
  ['scales', 'Honest about limits', 'Every finding has a confidence rating, and we say clearly what we could not verify.'],
]

export default async function Home() {
  const { showPublicPrices } = await getSiteSettings()
  return (
    <main className="home">
      <section className="home-hero">
        <div className="wrap home-hero__grid">
          <div className="home-hero__text">
            <p className="home-eyebrow">Ground verification and due diligence in Kenya</p>
            <h1 className="home-hero__title">
              Know what is on the ground <span>before you invest in Kenya.</span>
            </h1>
            <p className="home-hero__lead">
              We visit the land, building project or business in person, collect photos, video and GPS evidence, and send you
              an independent report before you commit money.
            </p>
            <div className="actions home-hero__actions">
              <Link className="btn btn-primary" href="/estimate">Get an estimate <Icon name="arrow" /></Link>
              <Link className="btn btn-secondary" href="/sample-report">See a sample report</Link>
            </div>
            <p className="home-hero__help">
              Not sure what you need? <Link href="/contact">Talk to an analyst</Link> and we will recommend the right check.
            </p>
          </div>
          <HeroShowcase />
        </div>
        <div className="wrap">
          <ul className="home-facts" aria-label="At a glance">
            {facts.map((f) => (
              <li key={f.title}>
                <span className="home-icon"><Icon name={f.icon} /></span>
                <span><strong>{f.title}</strong><span>{f.text}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="home-intro">
            <p className="home-eyebrow">Why it matters</p>
            <h2>Photos from the seller are not evidence.</h2>
            <p>When you invest from a distance, most of what you know comes from people who gain from the deal going ahead. We go and look for ourselves.</p>
          </div>
          <div className="home-compare">
            <div className="home-compare__row home-compare__head" aria-hidden="true">
              <p className="home-compare__before home-compare__label">What you usually rely on</p>
              <p className="home-compare__after home-compare__label">What you get from AngaVeritas</p>
            </div>
            {compare.map(([before, after]) => (
              <div className="home-compare__row" key={before}>
                <p className="home-compare__before"><span className="home-compare__mark" aria-hidden="true">×</span><span><span className="sr-only">Usually: </span>{before}</span></p>
                <p className="home-compare__after"><span className="home-compare__mark" aria-hidden="true"><Icon name="check" /></span><span><span className="sr-only">With AngaVeritas: </span>{after}</span></p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--grey" id="choose">
        <div className="wrap">
          <div className="home-intro home-intro--row">
            <div>
              <p className="home-eyebrow">What we check</p>
              <h2>What do you need to check?</h2>
              <p>Pick the situation closest to yours. The estimate starts with that service, and you can change it at any point.</p>
            </div>
            <Link className="btn btn-secondary" href="/contact?service=not-sure">Help me choose</Link>
          </div>
          <div className="home-stages">
            {stages.map((m, i) => (
              <div className="home-stage" key={m.label}>
                <p className="home-stage__label"><span>{i + 1}</span>{m.label}</p>
                {m.slugs.map((slug) => {
                  const s = services.find((x) => x.slug === slug)!
                  return (
                    <article className="home-service" key={s.slug}>
                      <span className="home-icon"><Icon name={s.icon} /></span>
                      <h3>{s.situation}</h3>
                      <p className="home-service__name">{s.title}</p>
                      <p className="home-service__text">{s.outcome}</p>
                      {showPublicPrices && <p className="home-service__price">From <strong>{formatKes(s.fromKes)}</strong>{s.unit ? ` ${s.unit}` : ''}</p>}
                      <div className="home-service__links">
                        <Link className="home-service__go" href={s.calculatorCode ? `/estimate?service=${s.slug}` : `/contact?service=${s.slug}`}>
                          {s.calculatorCode ? 'Get an estimate' : 'Talk to an analyst'} <Icon name="arrow" />
                        </Link>
                        <Link className="home-service__more" href={`/services#${s.slug}`}>Details<span className="sr-only"> about {s.title}</span></Link>
                      </div>
                    </article>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="home-intro home-intro--row">
            <div>
              <p className="home-eyebrow">How it works</p>
              <h2>From your question to a decision</h2>
              <p>Most reports are delivered in 5–10 business days. Priority and Express options are available when we have the capacity.</p>
            </div>
            <Link className="text-link" href="/how-it-works">More about our method</Link>
          </div>
          <ol className="home-steps">
            {steps.map(([t, d], i) => (
              <li key={t}>
                <span className="home-steps__num">{i + 1}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section--grey">
        <div className="wrap grid-2 home-split">
          <div>
            <p className="home-eyebrow">What you receive</p>
            <h2>Every finding is backed by evidence</h2>
            <p className="lead mt-sm">
              Each finding answers a question you asked and points to the photo or record behind it. It ends in a recommended
              decision you can act on.
            </p>
            <ul className="home-checks">{inReport.map((t) => <li key={t}><Icon name="check" />{t}</li>)}</ul>
            <div className="actions mt-lg items-center">
              <Link className="btn btn-secondary" href="/sample-report">Read the sample report</Link>
              <DownloadReport className="text-link link-download">Download PDF</DownloadReport>
            </div>
          </div>
          <SampleFinding />
        </div>
      </section>

      <section className="section">
        <div className="wrap grid-2 home-split home-split--flip">
          <DashboardPreview />
          <div>
            <p className="home-eyebrow">Your dashboard</p>
            <h2>Follow every step in one place</h2>
            <p className="lead mt-sm">You create a private account when you send your estimate. Your request, proposal, evidence and reports stay together there.</p>
            <ul className="home-features">
              {dashboard.map(([icon, t, d]) => (
                <li key={t}>
                  <span className="home-icon"><Icon name={icon} /></span>
                  <span><strong>{t}</strong><span>{d}</span></span>
                </li>
              ))}
            </ul>
            <div className="actions mt-lg">
              <Link className="btn btn-primary" href="/estimate">Get an estimate</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section home-trust">
        <div className="wrap">
          <div className="home-intro">
            <p className="home-eyebrow">Why clients trust the work</p>
            <h2>Independent, evidence first, and honest about what we found</h2>
          </div>
          <ul className="home-principles">
            {principles.map(([icon, t, d]) => (
              <li key={t}>
                <span className="home-icon"><Icon name={icon} /></span>
                <h3>{t}</h3>
                <p>{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="wrap grid-2 home-split">
          <div>
            <p className="home-eyebrow">Anywhere in Kenya</p>
            <h2>Investing from abroad?</h2>
            <p className="lead mt-sm">Get an independent view of your project without relying on relatives or the people you are paying.</p>
            <ul className="home-checks home-checks--one">
              <li><Icon name="check" />Photos, video and a written report, delivered digitally</li>
              <li><Icon name="check" />Calls at a time that suits your time zone</li>
              <li><Icon name="check" />Based in Nairobi, travelling to any county</li>
              <li><Icon name="check" />A confidentiality agreement before we start, if you need one</li>
            </ul>
          </div>
          <KenyaMap />
        </div>
      </section>

      <section className="section section--grey">
        <div className="wrap home-faq">
          <div>
            <p className="home-eyebrow">Questions</p>
            <h2>Common questions</h2>
            <p className="mt-sm text-ink-2">Something else on your mind? <Link href="/contact">Talk to an analyst</Link>.</p>
          </div>
          <div className="faq">
            {faq.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <CtaBox />
    </main>
  )
}
