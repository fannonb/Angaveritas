import type { Metadata } from 'next'
import Link from 'next/link'
import { CtaBox, EvidencePhoto } from '@/components/site/ui'
import { site } from '@/lib/site'

const principles = [
  ['Independent', 'We work for you, not for the seller, contractor or project owner. Our findings are not shaped by anyone with a stake in the outcome.'],
  ['Evidence first', 'Every conclusion is tied to evidence, and we say how strong that evidence is.'],
  ['Honest about limits', 'If we could not verify something, the report says so plainly.'],
  ['Consistent', 'Standard checklists in the field and a review before every report is released.'],
  ['Confidential', 'Your project details stay private. We sign an NDA when you need one.'],
]

function Team() {
  if (!site.team.length) return null
  return (
    <section className="section">
      <div className="wrap">
        <div className="section-intro"><h2>Who you will work with</h2></div>
        <div className="team-grid">
          {site.team.map((p) => (
            <article className="team-card" key={p.name}>
              {p.photo && <img src={p.photo} alt={p.name} width="320" height="320" loading="lazy" />}
              <h3>{p.name}</h3>
              <p className="team-role">{p.role}</p>
              {p.bio && <p className="muted">{p.bio}</p>}
              {p.linkedin && <a href={p.linkedin} target="_blank" rel="noopener">LinkedIn</a>}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export const metadata: Metadata = {
  title: "About",
  description: "AngaVeritas is a Kenyan investment intelligence and ground verification company providing independent, evidence-based visibility before capital is deployed.",
}

export default function About() {
  return (
    <main>
      <header className="page-head">
        <div className="wrap">
          <h1>About AngaVeritas</h1>
          <p className="lead">
            A Nairobi-based company that checks investments on the ground, so the people putting up
            the money can decide on facts instead of assumptions.
          </p>
        </div>
      </header>

      <section className="section">
        <div className="wrap grid-2">
          <div className="stack">
            <h2>Why we exist</h2>
            <p className="lead">
              Too many investments in Kenya are made on incomplete or second-hand information. For
              Kenyans abroad it is harder still: the people sending updates are often relatives,
              agents or contractors whose interests don't match yours.
            </p>
            <p className="muted">
              The result is familiar: stalled builds, businesses that don't exist as described, money
              sent for progress that never happened. AngaVeritas was set up to give investors an
              independent view of what is actually there.
            </p>
            <p className="muted">
              Our aim is to become the most trusted investment intelligence company in Kenya, one
              careful, evidence-based report at a time.
            </p>
          </div>
          <EvidencePhoto src="/images/field/field-farm-entrance.webp" id="AV-NAK-P02" label="Farm entrance, from our sample report" width="1148" height="504" wide />
        </div>
      </section>

      <section className="section section--grey">
        <div className="wrap grid-2 grid-2--top">
          <div>
            <h2>How we work</h2>
            <p className="lead mt-sm">The principles behind every visit and every report.</p>
            <p className="mt-md"><Link className="text-link" href="/how-it-works">See our process in detail</Link></p>
          </div>
          <dl className="def-list">
            {principles.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}
          </dl>
        </div>
      </section>

      <section className="section">
        <div className="wrap grid-2 grid-2--top">
          <div>
            <h2>Who we work with</h2>
          </div>
          <dl className="def-list">
            <div><dt>Kenyans abroad</dt><dd>Building, buying or investing at home without being able to visit.</dd></div>
            <div><dt>First-time investors</dt><dd>Professionals and entrepreneurs testing an idea before committing savings or a SACCO loan.</dd></div>
            <div><dt>Business owners</dt><dd>Expanding, entering a new market, or vetting suppliers and partners.</dd></div>
            <div><dt>Investor groups</dt><dd>Groups and organisations that need independent checks on projects or vendors.</dd></div>
          </dl>
        </div>
      </section>

      <Team />

      <CtaBox />
    </main>
  )
}
