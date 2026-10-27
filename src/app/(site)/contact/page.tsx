import type { Metadata } from 'next'
import Link from 'next/link'
import { Icon } from '@/components/site/ui'
import { formatPhone, site, telHref, waHref } from '@/lib/site'
import ContactForm from './ContactForm'

export const metadata: Metadata = {
  title: 'Talk to an analyst',
  description: 'Talk to AngaVeritas about a project in Kenya. Call, email, WhatsApp or send a message. We reply within one business day, wherever you are.',
}

export default async function Contact({ searchParams: searchParamsPromise }: { searchParams: Promise<{ service?: string }> }) {
  const searchParams = await searchParamsPromise
  return (
    <main>
      <header className="page-head">
        <div className="wrap">
          <h1>Talk to an analyst</h1>
          <p className="lead">
            Not sure what you need, or have a question first? Tell us in a few lines and an analyst replies within one
            business day. If you already know the service, you can <Link href="/estimate">get an estimate</Link> now.
          </p>
        </div>
      </header>

      <section className="section">
        <div className="wrap contact-grid">
          <div className="stack">
            <h2 className="h3-size">Prefer to talk?</h2>
            <div className="contact-methods">
              {site.phone && (
                <a className="contact-method" href={telHref(site.phone)}>
                  <Icon name="phone" />
                  <div><span>Call us</span><strong>{formatPhone(site.phone)}</strong></div>
                </a>
              )}
              {site.whatsapp && (
                <a className="contact-method" href={waHref(site.whatsapp)} target="_blank" rel="noopener">
                  <Icon name="whatsapp" />
                  <div><span>WhatsApp</span><strong>Message us</strong></div>
                </a>
              )}
              <a className="contact-method" href={`mailto:${site.email}`}>
                <Icon name="mail" />
                <div><span>Email</span><strong>{site.email}</strong></div>
              </a>
              {site.bookingUrl && (
                <a className="contact-method" href={site.bookingUrl} target="_blank" rel="noopener">
                  <Icon name="calendar" />
                  <div><span>Book a call</span><strong>Pick a time in your time zone</strong></div>
                </a>
              )}
              <div className="contact-method">
                <Icon name="pin" />
                <div><span>Office</span><strong>{site.location}</strong></div>
              </div>
            </div>

            <h2 className="h3-size mt-lg">Ready to start?</h2>
            <ol className="checklist checklist--plain">
              <li>Get an itemised estimate in a few minutes.</li>
              <li>We send a formal proposal. Scope and price are agreed there, before any work starts.</li>
              <li>Follow the work, evidence and report in your dashboard.</li>
            </ol>
            <p><Link className="btn btn-secondary" href="/estimate">Get an estimate</Link></p>
          </div>
          <ContactForm service={searchParams.service} />
        </div>
      </section>
    </main>
  )
}
