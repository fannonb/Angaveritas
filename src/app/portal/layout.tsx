import type { Metadata } from 'next'
import Link from 'next/link'
import AppMenu from '@/components/app/AppMenu'
import { AppTopbar } from '@/components/app/AppTopbar'
import { AppIcon } from '@/components/app/icons'
import NavLinks from '@/components/app/NavLinks'
import { NotificationButton, NotificationProvider } from '@/components/app/NotificationPanel'
import { logoutAction } from '@/app/(auth)/actions'
import { requireClient } from '@/lib/auth/session'
import { clientUnreadCount } from '@/lib/data/messages'
import { listNotifications } from '@/lib/data/misc'
import { formatPhone, site, telHref } from '@/lib/site'

export const metadata: Metadata = { title: { default: 'Dashboard', template: '%s | AngaVeritas' }, robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireClient()
  const asOf = Date.now()
  const [unreadMessages, notifications] = await Promise.all([clientUnreadCount(user.id), listNotifications(user.id, asOf)])
  const initials = user.full_name.split(' ').filter(Boolean).map((n) => n[0]).slice(0, 2).join('').toUpperCase() || 'CL'

  return (
    <NotificationProvider label="Updates" notifications={notifications} asOf={asOf} timezone={user.timezone}>
      <div className="app-ui app-shell">
        <AppMenu home="/portal" subtitle="Client portal" badge={unreadMessages} actions={<NotificationButton />}>
          <p className="side-label">Menu</p>
          <NavLinks
            className="side-nav"
            links={[
              { href: '/portal', label: 'Home', icon: 'home', exact: true },
              { href: '/portal/projects', label: 'My projects', icon: 'folder', also: ['/portal/requests'] },
              { href: '/portal/reports', label: 'Reports', icon: 'report' },
              { href: '/portal/payments', label: 'Payments', icon: 'wallet' },
              { href: '/portal/messages', label: 'Messages', icon: 'message', badge: unreadMessages },
            ]}
          />
          <div className="side-nav"><NotificationButton variant="sidebar" /></div>
          <p className="side-label">General</p>
          <div className="side-nav">
            <NavLinks className="contents" label="Account" links={[{ href: '/portal/account', label: 'Account', icon: 'user' }]} />
            <Link href="/sample-report"><AppIcon name="external" /><span>Sample report</span></Link>
            <form action={logoutAction}>
              <button type="submit"><AppIcon name="logout" /><span>Sign out</span></button>
            </form>
          </div>
          <div className="side-card">
            <p className="side-card__title">Talk to your analyst</p>
            <p className="side-card__text">
              {site.phone ? <>Call <a href={telHref(site.phone)}>{formatPhone(site.phone)}</a> or write to us.</> : 'Questions about a project? Write to us.'}
            </p>
            <Link href="/portal/messages" className="side-card__link">Send a message <AppIcon name="arrowRight" /></Link>
          </div>
          <div className="side-user">
            <span className="app-avatar" aria-hidden="true">{initials}</span>
            <span className="min-w-0">
              <span className="app-user__name">{user.full_name}</span>
              <span className="app-user__detail">{user.email}</span>
            </span>
          </div>
        </AppMenu>
        <div className="app-body">
          <AppTopbar
            shortcuts={[
              { href: '/portal/messages', label: 'Messages', icon: 'message', count: unreadMessages },
            ]}
            actions={<NotificationButton />}
            user={{ name: user.full_name, detail: user.email, href: '/portal/account' }}
          />
          <main className="app-content">{children}</main>
          <footer className="app-foot">
            <span>© {new Date().getFullYear()} AngaVeritas · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link></span>
            <span>Questions? <a href={`mailto:${site.email}`}>{site.email}</a></span>
          </footer>
        </div>
      </div>
    </NotificationProvider>
  )
}
