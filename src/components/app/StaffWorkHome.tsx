import Link from 'next/link'
import { PageHeader } from '@/components/app/AppTopbar'
import { InspectionChip } from '@/components/app/bits'
import { BarList, HealthDonut, Metric, initials, shortDay } from '@/components/app/dashboard'
import { daysUntil, fmtDate, fmtDateTime, kes, relativeDays } from '@/components/app/format'
import { AppIcon } from '@/components/app/icons'
import { requireStaff } from '@/lib/auth/session'
import { adminAttention } from '@/lib/data/attention'
import { staffWorkQueue, type WorkTask } from '@/lib/data/workqueue'
import { projectHealthCounts, staffStats, upcomingInspections } from '@/lib/data/dashboard'
import { threadsAwaitingReply } from '@/lib/data/messages'
import { listNotifications } from '@/lib/data/misc'
import { projectStageCounts } from '@/lib/data/projects'
import { projectStages, stageLabels, type Health, type ProjectStage } from '@/lib/labels'
import { site } from '@/lib/site'

export const metadata = { title: 'My work' }

type Visit = Awaited<ReturnType<typeof upcomingInspections>>[number]
const day = (d: string | null) => (d ? d.slice(0, 10) : null)

function DueChip({ due }: { due: string | null }) {
  const n = daysUntil(day(due))
  if (n === null) return <span className="chip chip--none chip--plain">No date set</span>
  if (n < 0) return <span className="chip chip--bad">Overdue · {relativeDays(day(due))}</span>
  if (n <= 2) return <span className="chip chip--warn">Due {relativeDays(day(due))}</span>
  return <span className="chip chip--none chip--plain">{fmtDate(due)}</span>
}

function TaskRow({ t }: { t: WorkTask }) {
  const who = initials(t.owner)
  return (
    <li>
      <Link href={t.href} className="row-link flex-wrap gap-y-2 py-3.5">
        {who ? (
          <span className="app-avatar" title={t.owner ?? undefined} aria-hidden="true">{who}</span>
        ) : (
          <span className="grid h-[2.6rem] w-[2.6rem] shrink-0 place-items-center rounded-full border-2 border-dashed border-line-strong text-muted" aria-hidden="true"><AppIcon name="user" /></span>
        )}
        <span className="min-w-0 flex-1 basis-56">
          <span className="row-link__title">{t.task}</span>
          <span className="row-link__meta">{t.label}</span>
          <span className="row-link__meta">
            {t.review ? 'Independent reviewer needed' : t.owner ?? 'Needs an owner'} · Waiting on {t.waiting_on.toLowerCase()}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {t.review && <span className="chip chip--info chip--plain">Review</span>}
          <DueChip due={t.due_on} />
          <AppIcon name="arrowRight" className="text-muted" />
        </span>
      </Link>
    </li>
  )
}

function NextVisit({ visit, manager }: { visit?: Visit; manager: boolean }) {
  const date = visit ? day(visit.scheduled_for) : null
  return (
    <section className="panel" aria-labelledby="next-visit">
      <div className="panel-head">
        <h2 id="next-visit">{visit?.status === 'in_progress' ? 'Visit in progress' : 'Next site visit'}</h2>
        {visit ? <Link href={`/staff/inspections/${visit.id}`} className="text-sm">Open visit</Link> : manager && <Link href="/staff/inspections" className="text-sm">Schedule</Link>}
      </div>
      <div className="panel-pad">
        {!visit ? (
          <>
            <p className="big-fact text-muted">None booked</p>
            <p className="mt-1.5 text-sm text-muted">{manager ? 'Prepare a project and assign an agent before booking a visit.' : 'Your coordinator will assign your next visit.'}</p>
          </>
        ) : (
          <>
            <p className="big-fact">{date ? shortDay(date) : 'Date to confirm'}</p>
            {date && <p className="mt-1 text-sm text-muted">{relativeDays(date).replace(/^./, (c) => c.toUpperCase())}</p>}
            <p className="mt-4 text-sm font-semibold">{visit.project_title}</p>
            <p className="mt-0.5 text-[0.78rem] text-muted">
              {visit.project_code} · {visit.code}
              {visit.location_label ? ` · ${visit.location_label}` : ''}
              {manager ? ` · ${visit.agent_name ?? 'No agent assigned'}` : ''}
            </p>
          </>
        )}
      </div>
    </section>
  )
}

function VisitList({ visits, manager, title, empty = 'No visits scheduled.' }: { visits: Visit[]; manager: boolean; title?: string; empty?: string }) {
  return (
    <section className="panel" aria-labelledby="visits">
      <div className="panel-head">
        <h2 id="visits">{title ?? (manager ? 'Upcoming & overdue visits' : 'Your next visits')}</h2>
        <Link href="/staff/inspections" className="text-sm">{manager ? 'Schedule' : 'All my visits'}</Link>
      </div>
      {!visits.length ? (
        <p className="empty">{empty}</p>
      ) : (
        <ul className="py-1.5">
          {visits.slice(0, 6).map((i) => {
            const n = daysUntil(day(i.scheduled_for))
            const tone = i.status === 'in_progress' ? 'tile--info' : n !== null && n < 0 ? 'tile--bad' : n !== null && n <= 2 ? 'tile--warn' : ''
            return (
              <li key={i.id}>
                <Link href={`/staff/inspections/${i.id}`} className="row-link">
                  <span className={`tile ${tone}`}><AppIcon name="pin" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="row-link__title truncate">{i.project_title}</span>
                    <span className="row-link__meta">
                      {i.scheduled_for ? `${fmtDate(i.scheduled_for)} · ${relativeDays(day(i.scheduled_for))}` : 'Date to confirm'}
                      {manager ? ` · ${i.agent_name ?? 'No agent'}` : i.location_label ? ` · ${i.location_label}` : ''}
                    </span>
                  </span>
                  <InspectionChip status={i.status as 'scheduled' | 'in_progress'} />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

type Attention = Awaited<ReturnType<typeof adminAttention>>
type Stats = NonNullable<Awaited<ReturnType<typeof staffStats>>>
type Threads = { thread: string; href: string; label: string; body: string; client_name: string; project_stage: string | null; last_at: Date }[]
type Notice = Awaited<ReturnType<typeof listNotifications>>[number]

// The admin home: what needs them first, then the pipeline and money, with the week's visits alongside.
function AttentionQueue({ attention }: { attention: Attention }) {
  return (
    <section className="panel" aria-labelledby="needs-you">
      <div className="panel-head">
        <h2 id="needs-you">Needs you</h2>
        <span className="text-sm text-muted">{attention.total ? `${attention.total} waiting` : 'All clear'}</span>
      </div>
      {attention.items.length === 0 ? (
        <p className="panel-pad text-ink-2">Nothing needs you right now. Reports, visits, client replies, payments, balances, enquiries and teams are all clear.</p>
      ) : (
        <ul className="py-1.5">
          {attention.items.map((i) => (
            <li key={i.key}>
              <Link href={i.href} className="row-link">
                <span className={`tile ${i.urgent ? 'tile--warn' : ''}`}><AppIcon name={i.icon} /></span>
                <span className="min-w-0 flex-1">
                  <span className="row-link__title">{i.count} {i.label}</span>
                  <span className="row-link__meta">
                    {i.hint}{i.oldestDays !== null ? ` · oldest ${i.oldestDays === 0 ? 'today' : `${i.oldestDays} day${i.oldestDays === 1 ? '' : 's'}`}` : ''}
                  </span>
                </span>
                <AppIcon name="arrowRight" className="text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function OpenTasks({ tasks }: { tasks: WorkTask[] }) {
  return (
    <section className="panel" aria-labelledby="tasks">
      <div className="panel-head">
        <h2 id="tasks">Open tasks</h2>
        <span className="text-sm text-muted">{tasks.length > 6 ? `6 of ${tasks.length}` : tasks.length} in the team</span>
      </div>
      {tasks.length === 0 ? (
        <p className="empty">No team tasks waiting.</p>
      ) : (
        <ul className="divide-y divide-line">
          {tasks.slice(0, 6).map((t) => <TaskRow key={t.key} t={t} />)}
        </ul>
      )}
    </section>
  )
}

function Pipeline({ stages, health }: { stages: Partial<Record<ProjectStage, number>>; health: Partial<Record<Health, number>> }) {
  return (
    <section className="panel" aria-labelledby="pipeline">
      <div className="panel-head">
        <h2 id="pipeline">Pipeline</h2>
        <Link href="/staff/projects?stage=all" className="text-sm">All projects</Link>
      </div>
      <div className="panel-pad space-y-4">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-7">
          {projectStages.map((s) => (
            <li key={s}>
              <Link href={`/staff/projects?stage=${s}`} className="block rounded-lg border border-line p-3 no-underline hover:bg-paper">
                <span className="block text-xs text-muted">{stageLabels[s]}</span>
                <span className="mt-1 block text-2xl font-semibold text-ink">{stages[s] ?? 0}</span>
              </Link>
            </li>
          ))}
        </ol>
        <p className="text-sm text-ink-2">
          Health: {health.on_track ?? 0} on track · {health.at_risk ?? 0} at risk · {health.high_risk ?? 0} high risk · {health.not_assessed ?? 0} not yet assessed
        </p>
      </div>
    </section>
  )
}

function Money({ stats, attention }: { stats: Stats; attention: Attention }) {
  return (
    <section className="panel" aria-labelledby="money">
      <div className="panel-head">
        <h2 id="money">Money</h2>
        <Link href="/staff/projects?need=balance" className="text-sm">Balances</Link>
      </div>
      <dl className="panel-pad grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted"><Link href="/staff/projects?need=unpaid" className="no-underline hover:underline">Waiting for a deposit</Link></dt>
          <dd className="mt-1 text-2xl font-semibold text-ink">{stats.awaiting_payment}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted"><Link href="/staff/projects?need=balance" className="no-underline hover:underline">Balance still to collect</Link></dt>
          <dd className="mt-1 text-2xl font-semibold text-ink">{stats.balance_outstanding}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Received this month</dt>
          <dd className="mt-1 text-2xl font-semibold text-ink">{kes(attention.paidMonthKes)}</dd>
        </div>
      </dl>
    </section>
  )
}

function AdminThreads({ threads }: { threads: Threads }) {
  return (
    <section className="panel" aria-labelledby="threads">
      <div className="panel-head">
        <h2 id="threads">Clients waiting for a reply</h2>
        <Link href="/staff/messages" className="text-sm">All conversations</Link>
      </div>
      {threads.length === 0 ? (
        <p className="empty">No client is waiting on the team.</p>
      ) : (
        <ul className="py-1.5">
          {threads.slice(0, 5).map((t) => (
            <li key={t.thread}>
              <Link href={t.href} className="row-link items-start">
                <span className="app-avatar" aria-hidden="true">{initials(t.client_name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="row-link__title">
                    {t.client_name} · {t.label}
                    {t.project_stage === 'closed' && <span className="chip chip--none chip--plain ml-2">Closed project</span>}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-sm text-ink-2">{t.body}</span>
                  <span className="row-link__meta">{fmtDateTime(t.last_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function RecentActivity({ notifications }: { notifications: Notice[] }) {
  return (
    <section className="panel" aria-labelledby="activity">
      <div className="panel-head"><h2 id="activity">Recent activity</h2><Link href="/staff/notifications" className="text-sm">All notifications</Link></div>
      {notifications.length === 0 ? (
        <p className="empty">Nothing yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {notifications.map((n) => (
            <li key={n.id} className="px-6 py-3 text-sm">
              {n.href ? <Link href={n.href}>{n.title}</Link> : n.title}
              <span className="block text-xs text-muted">{fmtDateTime(n.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AdminOverview({ denied, attention, stats, stages, health, tasks, visits, threads, notifications }: {
  denied?: string
  attention: Attention
  stats: Stats
  stages: Partial<Record<ProjectStage, number>>
  health: Partial<Record<Health, number>>
  tasks: WorkTask[]
  visits: Visit[]
  threads: Threads
  notifications: Notice[]
}) {
  const week = visits.filter((v) => {
    const n = daysUntil(day(v.scheduled_for))
    return n === null || n <= 7
  })
  return (
    <div className="space-y-5">
      <PageHeader
        title="Business overview"
        intro={attention.total ? `${attention.total} ${attention.total === 1 ? 'thing needs' : 'things need'} you. Work from the top of the list.` : 'Nothing needs you right now.'}
      >
        <div className="flex flex-wrap gap-2">
          <Link className="btn btn-secondary btn-small" href="/staff/inspections">Schedule</Link>
          <Link className="btn btn-primary btn-small" href="/staff/projects">All projects</Link>
        </div>
      </PageHeader>
      {denied && <p className="alert alert-warn">That page needs a different role.</p>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
        <div className="space-y-4">
          <AttentionQueue attention={attention} />
          <OpenTasks tasks={tasks} />
          <Pipeline stages={stages} health={health} />
          <Money stats={stats} attention={attention} />
        </div>
        <div className="space-y-4">
          <VisitList visits={week} manager title="Next 7 days" empty="No visits in the next 7 days." />
          <AdminThreads threads={threads} />
          <RecentActivity notifications={notifications} />
        </div>
      </div>
    </div>
  )
}

export default async function StaffWorkHome({ searchParams: promise }: { searchParams: Promise<{ denied?: string; view?: string }> }) {
  const query = await promise
  const user = await requireStaff()
  const manager = user.role !== 'field_agent'
  const admin = user.role === 'admin'
  const team = query.view === 'team' || (admin && query.view !== 'mine')
  const [myTasks, teamTasks, stats, health, stages, visits, threads, notifications] = await Promise.all([
    manager ? staffWorkQueue(user.id, false) : [],
    manager ? staffWorkQueue(user.id, true) : [],
    manager ? staffStats() : null,
    manager ? projectHealthCounts() : null,
    manager ? projectStageCounts() : null,
    upcomingInspections(manager ? undefined : user.id),
    manager ? threadsAwaitingReply() : [],
    listNotifications(user.id, 5),
  ])
  const tasks = team ? teamTasks : myTasks
  const attention = admin ? await adminAttention(threads) : null
  const notes = notifications.filter((n) => !n.read_at)
  const firstName = user.full_name.split(' ')[0]

  const updates = notes.length > 0 && (
    <details className="panel" id="updates">
      <summary className="panel-head cursor-pointer"><h2>Recent updates ({notes.length})</h2></summary>
      <ul className="divide-y divide-line">
        {notes.map((n) => (
          <li key={n.id} className="px-6 py-3 text-sm">
            {n.href ? <Link href={n.href}>{n.title}</Link> : n.title}
            <span className="block text-xs text-muted">{fmtDateTime(n.created_at)}</span>
          </li>
        ))}
      </ul>
    </details>
  )

  if (!manager) {
    const overdue = visits.filter((v) => v.status === 'scheduled' && (daysUntil(day(v.scheduled_for)) ?? 0) < 0).length
    const inProgress = visits.filter((v) => v.status === 'in_progress').length
    return (
      <div className="space-y-5">
        <PageHeader title="My visits" intro={`Hello ${firstName}. Open your visit, check the directions and record each required check.`} />
        {query.denied && <p className="alert alert-warn">That page needs a different role.</p>}
        <section aria-label="Your visits" className="grid gap-4 sm:grid-cols-3">
          <Metric label="Visits assigned" value={visits.length} href="/staff/inspections" foot="Scheduled or in progress" />
          <Metric label="In progress" value={inProgress} foot="Finish and submit for review" />
          <Metric label="Overdue" value={overdue} foot={overdue ? <><span className="metric__pill metric__pill--bad">Late</span> Tell your coordinator</> : 'Nothing late'} />
        </section>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
          <NextVisit visit={visits[0]} manager={false} />
          <VisitList visits={visits} manager={false} />
        </div>
        <section className="panel panel-pad flex flex-wrap items-center gap-4">
          <span className="tile"><AppIcon name="help" /></span>
          <div className="min-w-0 flex-1 basis-72">
            <h2 className="text-base">Need help at the site?</h2>
            <p className="mt-1 text-sm text-ink-2">
              Open the visit for directions and site contacts. If access is refused or it is unsafe to continue, record why the check could not be completed and contact your coordinator.
            </p>
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
            {site.phone && <a className="no-underline hover:underline" href={`tel:${site.phone.replace(/[^\d+]/g, '')}`}>Call coordinator</a>}
            <a className="no-underline hover:underline" href={`mailto:${site.email}`}>Email coordinator</a>
          </p>
        </section>
        {updates}
      </div>
    )
  }

  if (admin && attention && stats && stages && health) {
    return <AdminOverview denied={query.denied} attention={attention} stats={stats} stages={stages} health={health} tasks={teamTasks} visits={visits} threads={threads} notifications={notifications} />
  }

  const exceptions = stats
    ? [
        { n: stats.unassigned, label: 'without a team', text: 'Assign a lead analyst and field agent', href: '/staff/projects?need=unassigned', icon: 'users' },
        { n: stats.reports_in_review, label: 'reports awaiting review', text: 'Needs an admin to approve', href: '/staff/reviews', icon: 'review' },
        { n: stats.awaiting_payment, label: 'awaiting payment', text: 'Confirm the deposit or follow up', href: '/staff/projects?need=unpaid', icon: 'wallet' },
        { n: stats.balance_outstanding, label: 'with a balance outstanding', text: 'Deposit in, balance still to collect', href: '/staff/projects?need=balance', icon: 'wallet' },
      ]
    : []
  const threadList = threads.length > 0 && (
    <section className="panel" aria-labelledby="threads">
      <div className="panel-head">
        <h2 id="threads">Clients waiting for a reply</h2>
        <Link href="/staff/messages" className="text-sm">All conversations</Link>
      </div>
      <ul className="py-1.5">
        {threads.slice(0, 5).map((t) => (
          <li key={t.thread}>
            <Link href={t.href} className="row-link items-start">
              <span className="app-avatar" aria-hidden="true">{initials(t.client_name)}</span>
              <span className="min-w-0 flex-1">
                <span className="row-link__title">{t.client_name} · {t.label}</span>
                <span className="mt-0.5 line-clamp-2 block text-sm text-ink-2">{t.body}</span>
                <span className="row-link__meta">{fmtDateTime(t.last_at)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title={team ? 'Team work' : 'My work'}
        intro={`${admin ? 'Business overview' : `Hello ${firstName}`}. Open a task to see what is needed, who is responsible and what happens next.`}
      >
        <nav className="segmented" aria-label="Work scope">
          <Link href="/staff?view=mine" aria-current={!team ? 'page' : undefined}>Mine <span className="count">{myTasks.length}</span></Link>
          <Link href="/staff?view=team" aria-current={team ? 'page' : undefined}>Team <span className="count">{teamTasks.length}</span></Link>
        </nav>
      </PageHeader>
      {query.denied && <p className="alert alert-warn">That page needs a different role.</p>}

      {stats && (
        <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Active projects"
            value={stats.active_projects}
            href="/staff/projects"
            foot={stats.at_risk ? <><span className="metric__pill">{stats.at_risk}</span> at risk or high risk</> : 'None flagged at risk'}
          />
          <Metric
            label="Open enquiries"
            value={stats.open_requests}
            href="/staff/requests"
            foot={<>{stats.new_requests > 0 && <span className="metric__pill metric__pill--warn">{stats.new_requests} new</span>}{stats.proposals_out} proposal{stats.proposals_out === 1 ? '' : 's'} with clients</>}
          />
          <Metric label="Reports in review" value={stats.reports_in_review} href="/staff/reviews" foot="Second-person approval before publishing" />
          <Metric label="Visits next 7 days" value={stats.inspections_week} href="/staff/inspections" foot={stats.onboarding_waiting ? `${stats.onboarding_waiting} project${stats.onboarding_waiting === 1 ? '' : 's'} waiting on client details` : 'Scheduled or in progress'} />
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
        <div className="space-y-4">
          <section className="panel" aria-labelledby="work-queue">
            <div className="panel-head">
              <h2 id="work-queue">{team ? 'Team tasks' : 'Your tasks & eligible reviews'}</h2>
              <span className="text-sm text-muted">{tasks.length}{tasks.length === 100 ? '+' : ''} task{tasks.length === 1 ? '' : 's'}</span>
            </div>
            {tasks.length === 0 ? (
              <div className="panel-pad space-y-3">
                <p className="text-ink-2">
                  {!team
                    ? `You have no tasks assigned directly to you right now. There ${teamTasks.length === 1 ? 'is' : 'are'} ${teamTasks.length} task${teamTasks.length === 1 ? '' : 's'} across the team.`
                    : 'No team tasks waiting in this view.'}
                </p>
                {!team && teamTasks.length > 0 && <Link className="btn btn-secondary btn-small" href="/staff?view=team">Check team tasks ({teamTasks.length})</Link>}
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {tasks.map((t) => <TaskRow key={t.key} t={t} />)}
              </ul>
            )}
          </section>
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            {stages && (
              <section className="panel" aria-labelledby="pipeline">
                <div className="panel-head"><h2 id="pipeline">Projects by stage</h2><Link href="/staff/projects?stage=all" className="text-sm">All projects</Link></div>
                <div className="panel-pad pt-4">
                  <BarList rows={projectStages.filter((s) => s !== 'closed').map((s) => ({ key: s, label: stageLabels[s], value: stages[s] ?? 0, href: `/staff/projects?stage=${s}` }))} />
                </div>
              </section>
            )}
            <VisitList visits={visits} manager />
          </div>
          {admin && threadList}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <NextVisit visit={visits[0]} manager />
          {health && (
            <section className="panel" aria-labelledby="health">
              <div className="panel-head"><h2 id="health">Portfolio health</h2><span className="text-sm text-muted">Open projects</span></div>
              <div className="panel-pad"><HealthDonut counts={health} /></div>
            </section>
          )}
          {admin ? (
            <section className="panel" aria-labelledby="attention">
              <div className="panel-head"><h2 id="attention">Needs intervention</h2><Link href="/staff/integrations" className="text-sm">Service health</Link></div>
              <ul className="py-1.5">
                {exceptions.map((e) => (
                  <li key={e.href}>
                    <Link href={e.href} className="row-link">
                      <span className={`tile ${e.n ? 'tile--warn' : 'tile--none'}`}><AppIcon name={e.icon} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="row-link__title">{e.n} {e.label}</span>
                        <span className="row-link__meta">{e.text}</span>
                      </span>
                      <AppIcon name="arrowRight" className="text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            threadList || (
              <section className="panel panel-pad">
                <h2>Clients waiting for a reply</h2>
                <p className="mt-2 text-sm text-muted">No client is waiting on the team. <Link href="/staff/messages">All conversations</Link></p>
              </section>
            )
          )}
        </div>
      </div>

      {updates}
    </div>
  )
}
