'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { formatPhone, site, telHref, waHref } from '@/lib/site'
import { Icon } from './ui'

const nav = [
  { href: '/services', label: 'Services' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/sample-report', label: 'Sample report' },
  { href: '/about', label: 'About' },
]

/** Reads the non-secret sign-in hint cookie so static pages can show the right account link. */
function useAccount() {
  const [account, setAccount] = useState<'client' | 'staff' | null>(null)
  useEffect(() => {
    const m = document.cookie.match(/(?:^|; )av_signed_in=(client|staff)/)
    setAccount((m?.[1] as 'client' | 'staff') ?? null)
  }, [])
  return account
}

function AccountLink({ className, icon }: { className?: string; icon?: boolean }) {
  const account = useAccount()
  const label = account ? 'My dashboard' : 'Sign in'
  return (
    <Link className={className} href={account === 'staff' ? '/staff' : account ? '/portal' : '/login'}>
      {icon && <Icon name="user" />}
      {label}
    </Link>
  )
}

export function Header() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  useEffect(() => setOpen(false), [pathname])
  const current = (href: string) => (pathname === href ? 'page' : undefined)
  return (
    <>
      <div className="topbar">
        <div className="wrap topbar__inner">
          <p>Independent ground verification and due diligence across Kenya</p>
          <ul className="topbar__links">
            <li className="topbar__muted">Mon–Fri, East Africa Time</li>
            {site.phone && <li><a href={telHref(site.phone)}><Icon name="phone" />{formatPhone(site.phone)}</a></li>}
            <li><a href={`mailto:${site.email}`}><Icon name="mail" />{site.email}</a></li>
          </ul>
        </div>
      </div>
      <header className="site-header">
        <div className="wrap header-inner">
          <Link className="brand" href="/" aria-label="AngaVeritas home">
            <img src="/images/logo.webp" alt="AngaVeritas" width="640" height="227" />
          </Link>
          <nav className="nav" aria-label="Main">
            {nav.map(({ href, label }) => <Link key={href} href={href} aria-current={current(href)}>{label}</Link>)}
          </nav>
          <div className="header-actions">
            <AccountLink className="header-account" icon />
            <Link className="btn btn-primary btn-small header-cta" href="/estimate">Get an estimate <Icon name="arrow" /></Link>
          </div>
          <button className="menu-toggle" type="button" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((o) => !o)}>
            <Icon name={open ? 'close' : 'menu'} />
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
        <div id="mobile-menu" className={`mobile-menu${open ? ' is-open' : ''}`}>
          <nav aria-label="Main">
            {nav.map(({ href, label }) => <Link key={href} href={href} aria-current={current(href)}>{label}</Link>)}
            <Link href="/contact" aria-current={current('/contact')}>Contact</Link>
          </nav>
          <div className="mobile-menu__actions">
            <Link className="btn btn-primary" href="/estimate">Get an estimate</Link>
            <AccountLink className="btn btn-secondary" />
          </div>
          <div className="mobile-menu__contact">
            {site.phone && <a href={telHref(site.phone)}><Icon name="phone" />{formatPhone(site.phone)}</a>}
            <a href={`mailto:${site.email}`}><Icon name="mail" />{site.email}</a>
          </div>
        </div>
      </header>
    </>
  )
}

export function ActionBar() {
  const pathname = usePathname()
  if (pathname === '/estimate') return null
  return (
    <div className="action-bar">
      {site.phone && <a className="btn btn-secondary" href={telHref(site.phone)}><Icon name="phone" /> Call</a>}
      {site.whatsapp && <a className="btn btn-secondary" href={waHref(site.whatsapp)} target="_blank" rel="noopener"><Icon name="whatsapp" /> WhatsApp</a>}
      <Link className="btn btn-primary" href="/estimate">Get an estimate</Link>
    </div>
  )
}
