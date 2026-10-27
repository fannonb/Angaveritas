import Link from 'next/link'
import { formatPhone, site, telHref, waHref } from '@/lib/site'
import { services } from '@/site/services'
import { Icon } from './ui'

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-grid">
          <div className="footer-brand">
            <h2>AngaVeritas</h2>
            <p>Independent ground verification and investment intelligence for people investing in Kenya.</p>
          </div>
          <div>
            <h2>Services</h2>
            <ul>{services.map((s) => <li key={s.slug}><Link href={`/services#${s.slug}`}>{s.title}</Link></li>)}</ul>
          </div>
          <div>
            <h2>Company</h2>
            <ul>
              <li><Link href="/how-it-works">How it works</Link></li>
              <li><Link href="/pricing">Pricing</Link></li>
              <li><Link href="/estimate">Instant estimate</Link></li>
              <li><Link href="/sample-report">Sample report</Link></li>
              <li><Link href="/about">About</Link></li>
              <li><Link href="/contact">Contact</Link></li>
              <li><Link href="/login">Client sign in</Link></li>
            </ul>
          </div>
          <div>
            <h2>Contact</h2>
            <ul>
              {site.phone && <li><a href={telHref(site.phone)}>{formatPhone(site.phone)}</a></li>}
              {site.whatsapp && <li><a href={waHref(site.whatsapp)} target="_blank" rel="noopener">WhatsApp</a></li>}
              <li><a href={`mailto:${site.email}`}>{site.email}</a></li>
              <li>{site.location}</li>
              <li className="muted">Mon–Fri, East Africa Time (UTC+3)</li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} AngaVeritas</span>
          <nav aria-label="Legal">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}

export function WhatsAppButton() {
  if (!site.whatsapp) return null
  return (
    <a className="wa-float" href={waHref(site.whatsapp, 'Hello AngaVeritas, I would like to discuss a project.')} target="_blank" rel="noopener" aria-label="Chat with AngaVeritas on WhatsApp">
      <Icon name="whatsapp" />
    </a>
  )
}
