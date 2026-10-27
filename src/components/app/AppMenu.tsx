'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AppIcon } from './icons'

/** The sidebar of the portal and staff workspace. Below 1000px it collapses into a top bar with a menu button, so pages open on their content. */
export default function AppMenu({ home, subtitle, badge, children }: { home: string; subtitle: string; badge?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  useEffect(() => setOpen(false), [pathname])

  return (
    <aside className={`app-side${open ? ' is-open' : ''}`}>
      <div className="app-side__bar">
        <Link href={home} className="app-logo" aria-label={`AngaVeritas ${subtitle}`}>
          <img src="/images/logo.webp" alt="AngaVeritas" width="640" height="227" className="app-logo__img" />
        </Link>
        <button type="button" className="app-side__toggle" aria-expanded={open} aria-controls="app-nav" onClick={() => setOpen((o) => !o)}>
          <AppIcon name={open ? 'close' : 'menu'} />
          {open ? 'Close' : 'Menu'}
          {!open && badge ? <span className="badge">{badge}</span> : null}
        </button>
      </div>
      <div id="app-nav" className="app-side__nav">{children}</div>
    </aside>
  )
}
