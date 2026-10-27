import type { Metadata } from 'next'
import Link from 'next/link'
import { CtaBox, Icon } from '@/components/site/ui'
import { getSiteSettings } from '@/lib/data/settings'
import { addOns, formatKes, included, services, stages } from '@/site/services'

export const metadata: Metadata = {
  title: "Services",
  description: "Ground verification, supplier and contractor checks, project monitoring, business due diligence, feasibility studies and oversight retainers across Kenya.",
}

const bySlug = (slug: string) => services.find((s) => s.slug === slug)!

export default async function Services() {
  const { showPublicPrices } = await getSiteSettings()
  return (
    <main>
      <header className="page-head">
        <div className="wrap">
          <h1>Services</h1>
          <p className="lead">
            Six services, grouped by where you are in an investment. Every one includes a written report, photos, video and
            GPS evidence.
          </p>
          <nav className="stage-map" aria-label="Services by stage">
            {stages.map((st, i) => (
              <div className="stage-map__col" key={st.id}>
                <a className="stage-map__head" href={`#${st.id}`}><span>{i + 1}</span>{st.label}</a>
                <ul>
                  {st.slugs.map(bySlug).map((s) => (
                    <li key={s.slug}>
                      <a href={`#${s.slug}`}>
                        <Icon name={s.icon} />
                        <span><strong>{s.situation}</strong>{s.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </header>

      {stages.map((st, i) => (
        <section className={`stage${i % 2 ? ' stage--grey' : ''}`} id={st.id} key={st.id} aria-labelledby={`${st.id}-title`}>
          <div className="wrap">
            <div className="stage__head">
              <div>
                <p className="stage__num">Stage {i + 1}</p>
                <h2 id={`${st.id}-title`}>{st.label}</h2>
                <p className="stage__blurb">{st.blurb}</p>
              </div>
              <figure className="stage__photo">
                <img src={st.image} alt={st.alt} width="1200" height="896" loading={i === 0 ? 'eager' : 'lazy'} />
                <figcaption>Illustrative photo</figcaption>
              </figure>
            </div>

            <div className="svc-grid">
              {st.slugs.map(bySlug).map((s) => (
                <article className="svc" id={s.slug} key={s.slug} aria-labelledby={`${s.slug}-title`}>
                  <div className="svc__top">
                    <span className="q-card__icon"><Icon name={s.icon} /></span>
                    <p className="svc__situation">{s.situation}</p>
                  </div>
                  <h3 className="svc__title" id={`${s.slug}-title`}>{s.title}</h3>
                  <p className="svc__q">“{s.question}”</p>
                  <p className="svc__summary">{s.summary}</p>

                  <div className="svc__lists">
                    <div>
                      <h4>Use it when</h4>
                      <ul className="checklist checklist--plain">{s.useWhen.map((x) => <li key={x}>{x}</li>)}</ul>
                    </div>
                    <div>
                      <h4>What we check</h4>
                      <ul className="checklist">{s.checks.map((x) => <li key={x}>{x}</li>)}</ul>
                    </div>
                  </div>

                  <div className="svc__foot">
                    <p className="svc__meta">
                      {showPublicPrices && <span>From <strong>{formatKes(s.fromKes)}</strong>{s.unit ? ` ${s.unit}` : ''}</span>}
                      <span>{s.unit === 'per month' ? 'Monthly reporting' : 'Report in 5–10 business days'}</span>
                    </p>
                    <div className="actions">
                      {s.calculatorCode && <Link className="btn btn-primary btn-small" href={`/estimate?service=${s.slug}`}>Get an estimate</Link>}
                      <Link className={`btn btn-small ${s.calculatorCode ? 'btn-secondary' : 'btn-primary'}`} href={`/contact?service=${s.slug}`}>Talk to an analyst</Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ))}

      <section className="section included">
        <div className="wrap">
          <div className="section-intro">
            <h2>Included in every service</h2>
            <p>No extra charge for the essentials. Every report contains all of this.</p>
          </div>
          <ul className="included-grid">
            {included.map(([icon, t, d]) => (
              <li key={t}>
                <span className="q-card__icon"><Icon name={icon} /></span>
                <strong>{t}</strong>
                <span>{d}</span>
              </li>
            ))}
          </ul>
          <div className="extras">
            <p className="extras__label">Optional extras, quoted separately</p>
            <ul>
              {addOns.map(([t, d]) => <li key={t}><strong>{t}</strong><span>{d}</span></li>)}
            </ul>
          </div>
        </div>
      </section>

      <CtaBox title="Not sure which service you need?" text="Describe your situation. We reply within one business day and recommend the right service." actionLabel="Talk to an analyst" actionHref="/contact?service=not-sure" />
    </main>
  )
}
