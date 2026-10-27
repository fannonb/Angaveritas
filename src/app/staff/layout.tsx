import type { Metadata } from 'next'
import Link from 'next/link'
import AppMenu from '@/components/app/AppMenu'
import { AppTopbar } from '@/components/app/AppTopbar'
import { AppIcon } from '@/components/app/icons'
import NavLinks from '@/components/app/NavLinks'
import { logoutAction } from '@/app/(auth)/actions'
import { requireStaff } from '@/lib/auth/session'
import { adminAttention } from '@/lib/data/attention'
import { staffStats } from '@/lib/data/dashboard'
import { threadsAwaitingReply } from '@/lib/data/messages'
import { unreadNotificationCount } from '@/lib/data/misc'
import { roleLabels } from '@/lib/labels'

export const metadata: Metadata = { title: { default: 'Workspace', template: '%s | AngaVeritas staff' }, robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff()
  const manager = user.role !== 'field_agent'
  const [stats, unread, attention] = await Promise.all([
    manager ? staffStats() : null,
    unreadNotificationCount(user.id),
    user.role === 'admin' ? threadsAwaitingReply().then((threads) => adminAttention(threads)) : null,
  ])

  const work = [
    { href: '/staff', label: user.role === 'admin' ? 'Business overview' : manager ? 'My work' : 'Today', icon: 'grid', exact: true, badge: attention ? attention.total : unread },
    ...(manager
      ? [
          { href: '/staff/requests', label: 'Enquiries & proposals', icon: 'inbox', badge: stats?.open_requests },
          { href: '/staff/projects', label: 'Projects', icon: 'folder' },
          { href: '/staff/inspections', label: 'Schedule', icon: 'calendar' },
          { href: '/staff/reviews', label: 'Reviews', icon: 'review', badge: stats?.reports_in_review },
          { href: '/staff/messages', label: 'Messages', icon: 'message' },
          ...(user.role === 'admin' ? [{ href: '/staff/revenue', label: 'Revenue', icon: 'barChart' }] : []),
        ]
      : [
          { href: '/staff/inspections', label: 'My visits', icon: 'calendar' },
          { href: '/staff/help', label: 'Help', icon: 'help' },
        ]),
  ]
  const crm = manager
    ? [
        { href: '/staff/clients', label: 'Clients', icon: 'users' },
        { href: '/staff/enquiries', label: 'Website enquiries', icon: 'globe', badge: stats?.enquiries },
      ]
    : []
  const admin = [
    ...(manager ? [{ href: '/staff/pricing', label: 'Pricing', icon: 'tag' }] : []),
    ...(user.role === 'admin'
      ? [
          { href: '/staff/team', label: 'Team', icon: 'team' },
          { href: '/staff/activity', label: 'Audit log', icon: 'list' },
          { href: '/staff/integrations', label: 'Integrations', icon: 'plug' },
        ]
      : []),
  ]

  return (
    <div className="app-ui app-shell">
      <AppMenu home="/staff" subtitle="Operations workspace" badge={(unread || 0) + (stats?.new_requests || 0) + (stats?.reports_in_review || 0)}>
        <p className="side-label">Work</p>
        <NavLinks className="side-nav" links={work} />
        {crm.length > 0 && (<><p className="side-label">Clients</p><NavLinks className="side-nav" links={crm} label="Clients" /></>)}
        {admin.length > 0 && (<><p className="side-label">Settings</p><NavLinks className="side-nav" links={admin} label="Settings" /></>)}
        <p className="side-label">General</p>
        <div className="side-nav">
          <Link href="/"><AppIcon name="external" /><span>Website</span></Link>
          <form action={logoutAction}>
            <button type="submit"><AppIcon name="logout" /><span>Sign out</span></button>
          </form>
        </div>
        <div className="side-card">
          {manager ? (
            <>
              <p className="side-card__title">Price a new job</p>
              <p className="side-card__text">Run the estimator with a client on the phone. It becomes a request you can qualify.</p>
              <Link href="/estimate" className="side-card__link">Open estimator <AppIcon name="arrowRight" /></Link>
            </>
          ) : (
            <>
              <p className="side-card__title">Stuck at a site?</p>
              <p className="side-card__text">Record why a check could not be done, then contact your coordinator.</p>
              <Link href="/staff/help" className="side-card__link">Field help <AppIcon name="arrowRight" /></Link>
            </>
          )}
        </div>
        <div className="side-user">
          <span className="app-avatar" aria-hidden="true">{user.full_name.split(' ').filter(Boolean).map((n) => n[0]).slice(0, 2).join('').toUpperCase() || 'AV'}</span>
          <span className="min-w-0">
            <span className="app-user__name">{user.full_name}</span>
            <span className="app-user__detail">{roleLabels[user.role]}</span>
          </span>
        </div>
      </AppMenu>
      <div className="app-body">
        <AppTopbar
          search={manager ? { action: '/staff/projects', placeholder: 'Search projects, clients, places…', params: { stage: 'all' } } : undefined}
          shortcuts={[
            ...(manager ? [{ href: '/staff/messages', label: 'Messages', icon: 'message' }] : []),
            { href: '/staff/notifications', label: 'Notifications', icon: 'bell', count: unread },
          ]}
          user={{ name: user.full_name, detail: roleLabels[user.role] }}
        />
        <main className="app-content">{children}</main>
      </div>
    </div>
  )
}
