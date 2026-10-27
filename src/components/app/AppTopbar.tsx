import Link from 'next/link'
import { AppIcon } from './icons'

type Shortcut = { href: string; label: string; icon: string; count?: number }

/** Desktop top bar: an optional search, shortcut buttons with unread counts, and the signed-in person. */
export function AppTopbar({ search, shortcuts, user }: { search?: { action: string; placeholder: string; params?: Record<string, string> }; shortcuts: Shortcut[]; user: { name: string; detail: string; href?: string } }) {
  const initials = user.name.split(' ').filter(Boolean).map((n) => n[0]).slice(0, 2).join('').toUpperCase() || 'AV'
  const who = (
    <>
      <span className="app-avatar" aria-hidden="true">{initials}</span>
      <span className="min-w-0">
        <span className="app-user__name">{user.name}</span>
        <span className="app-user__detail">{user.detail}</span>
      </span>
    </>
  )
  return (
    <header className="app-topbar no-print">
      {search ? (
        <form action={search.action} role="search" className="app-search">
          <AppIcon name="search" />
          {Object.entries(search.params ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input name="q" type="search" placeholder={search.placeholder} aria-label={search.placeholder} />
        </form>
      ) : (
        <p className="mr-auto flex items-center gap-2.5 pl-2 text-sm font-semibold text-ink-2">
          <span className="icon-btn" aria-hidden="true"><AppIcon name="calendar" /></span>
          {new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Nairobi' }).format(new Date())}
        </p>
      )}
      <div className="flex items-center gap-2">
        {shortcuts.map((s) => (
          <Link key={s.href} href={s.href} className="icon-btn" title={s.label}>
            <AppIcon name={s.icon} />
            <span className="sr-only">{s.label}{s.count ? ` (${s.count} new)` : ''}</span>
            {s.count ? <span className="icon-btn__count" aria-hidden="true">{s.count > 9 ? '9+' : s.count}</span> : null}
          </Link>
        ))}
      </div>
      {user.href ? <Link href={user.href} className="app-user">{who}</Link> : <span className="app-user">{who}</span>}
    </header>
  )
}

/** Page title block: a title, one line of context and the page's actions. */
export function PageHeader({ title, intro, children }: { title: React.ReactNode; intro?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="app-head">
      <div className="min-w-0">
        <h1 className="app-title">{title}</h1>
        {intro && <p className="app-head__intro">{intro}</p>}
      </div>
      {children && <div className="app-head__actions">{children}</div>}
    </div>
  )
}
