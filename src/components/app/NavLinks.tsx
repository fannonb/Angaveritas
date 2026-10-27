'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AppIcon } from './icons'

export type NavLink = { href: string; label: string; icon?: string; badge?: number; exact?: boolean; also?: string[] }

/** Navigation links that mark the current section. `also` lists other paths that belong to the same section. */
export default function NavLinks({ links, className, label = 'Sections' }: { links: NavLink[]; className?: string; label?: string }) {
  const pathname = usePathname()
  return (
    <nav className={className} aria-label={label}>
      {links.map((l) => {
        const within = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
        const active = l.exact ? pathname === l.href : within(l.href) || !!l.also?.some(within)
        return (
          <Link key={l.href} href={l.href} aria-current={active ? 'page' : undefined}>
            {l.icon && <AppIcon name={l.icon} />}
            <span>{l.label}</span>
            {l.badge ? <span className="badge">{l.badge}</span> : null}
          </Link>
        )
      })}
    </nav>
  )
}
