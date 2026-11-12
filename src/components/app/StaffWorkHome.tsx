import Link from 'next/link'
import { PageHeader } from '@/components/app/AppTopbar'
import { InspectionChip } from '@/components/app/bits'
import { dismissReplyAction } from '@/app/staff/actions'
import { BarList, HealthDonut, Metric, initials, shortDay } from '@/components/app/dashboard'
import { daysUntil, fmtDate, fmtDateTime, kes, relativeDays } from '@/components/app/format'
import { AppIcon } from '@/components/app/icons'
import { requireStaff } from '@/lib/auth/session'
import { adminMoney, adminTodo, adminUpcoming, recentActivity } from '@/lib/data/overview'
import { staffWorkQueue, type WorkTask } from '@/lib/data/workqueue'
import { projectHealthCounts, staffStats, upcomingInspections } from '@/lib/data/dashboard'
import { threadsAwaitingReply } from '@/lib/data/messages'
import { unreadNotifications } from '@/lib/data/misc'
import { projectStageCounts } from '@/lib/data/projects'
import { arrivalLabel, healthChip, healthLabels, projectStages, stageLabels, type Health, type ProjectStage } from '@/lib/labels'
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

type Todos = Awaited<ReturnType<typeof adminTodo>>
type Todo = Todos['all'][number]
type TodoView = 'all' | 'mine' | 'client'
type Upcoming = Awaited<ReturnType<typeof adminUpcoming>>[number]
type Money = Awaited<ReturnType<typeof adminMoney>>
type Activity = Awaited<ReturnType<typeof recentActivity>>[number]

function OpenTasks({ tasks, personal=false }: { tasks: WorkTask[]; personal?:boolean }) {
  const ready = tasks.filter(t=>t.waiting_on!=='Client')
  const waiting = tasks.filter(t=>t.waiting_on==='Client')
  return (
    <div className="space-y-4">
      <section className="panel" aria-labelledby="tasks">
        <div className="panel-head"><h2 id="tasks">{personal ? 'Your actions & eligible reviews' : 'Team actions'} ({ready.length})</h2><span className="text-sm text-muted">Most urgent first</span></div>
        {ready.length ? <>
          <ul className="divide-y divide-line">{ready.slice(0,6).map(t=><TaskRow key={t.key} t={t}/>)}</ul>
          {ready.length>6&&<details className="panel-pad"><summary className="cursor-pointer text-sm font-semibold">Show {ready.length-6} more actions</summary><ul className="divide-y divide-line">{ready.slice(6).map(t=><TaskRow key={t.key} t={t}/>)}</ul></details>}
        </> : <p className="empty">No actions waiting in this view.</p>}
      </section>
      {waiting.length>0&&<details className="panel">
        <summary className="panel-head cursor-pointer"><h2>Waiting on clients ({waiting.length})</h2><span className="text-sm text-muted">Follow up if needed</span></summary>
        <ul className="divide-y divide-line">{waiting.map(t=><TaskRow key={t.key} t={t}/>)}</ul>
      </details>}
    </div>
  )
}

// ---------- Business overview (admin): what needs doing, what is coming up, how the business is doing, what happened ----------

const daysAgo = (d: Date) => Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000))
const kenyaDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(d)
const kenyaTime = (d: Date) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' }).format(d)
function dayLabel(date: string) {
  const n = daysUntil(date)
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : shortDay(date)
}

// A client reply in the to-do list; other work uses TaskRow.
function TodoRow({ t }: { t: Todo }) {
  if (!t.key.startsWith('reply:') || !t.since) return <TaskRow t={t} />
  const days = daysAgo(t.since)
  return (
    <li className="flex items-center">
      <Link href={t.href} className="row-link min-w-0 flex-1 flex-wrap gap-y-2 py-3.5">
        <span className={`tile ${t.closed ? 'tile--none' : days > 2 ? 'tile--warn' : ''}`}><AppIcon name="message" /></span>
        <span className="min-w-0 flex-1 basis-56">
          <span className="row-link__title">{t.task}</span>
          <span className="row-link__meta">{t.label}</span>
          {t.note && <span className="mt-0.5 line-clamp-1 block text-sm text-ink-2">&ldquo;{t.note}&rdquo;</span>}
        </span>
        <span className="flex items-center gap-2">
          {t.closed
            ? <span className="chip chip--none chip--plain">Closed project</span>
            : <span className={`chip ${days > 2 ? 'chip--warn' : 'chip--none chip--plain'}`}>Waiting {days === 0 ? 'since today' : `${days} day${days === 1 ? '' : 's'}`}</span>}
          <AppIcon name="arrowRight" className="text-muted" />
        </span>
      </Link>
      {/* No reply needed (e.g. "Thank you"): clears it until the client writes again. */}
      <form action={dismissReplyAction} className="pr-4">
        <input type="hidden" name="thread" value={t.key.slice('reply:'.length)} />
        <button type="submit" aria-label={`No reply needed: ${t.task}`} title="No reply needed" className="grid h-8 w-8 place-items-center rounded-full border-0 bg-transparent text-lg leading-none text-muted hover:bg-paper hover:text-ink">×</button>
      </form>
    </li>
  )
}

function TodoList({ todo, view }: { todo: Todos; view: TodoView }) {
  const list = view === 'mine' ? todo.mine : view === 'client' ? todo.client : todo.all
  // Counts leave out replies on closed projects, matching the header and the sidebar badge; those rows still show, last.
  const open = (l: Todo[]) => l.filter((t) => !t.closed).length
  const tabs: [TodoView, string, number][] = [['all', 'All', open(todo.all)], ['mine', 'Mine', open(todo.mine)], ['client', 'Waiting on client', open(todo.client)]]
  return (
    <section className="panel" aria-labelledby="todo">
      <div className="panel-head flex-wrap gap-3">
        <h2 id="todo">To do</h2>
        <nav className="segmented" aria-label="Filter the to-do list">
          {tabs.map(([v, label, n]) => <Link key={v} href={v === 'all' ? '/staff' : `/staff?todo=${v}`} aria-current={view === v ? 'page' : undefined} scroll={false}>{label} <span className="count">{n}</span></Link>)}
        </nav>
      </div>
      {list.length ? (
        <>
          <ul className="divide-y divide-line">{list.slice(0, 7).map((t) => <TodoRow key={t.key} t={t} />)}</ul>
          {list.length > 7 && (
            <details className="border-t border-line">
              <summary className="cursor-pointer px-6 py-3 text-sm font-semibold">Show {list.length - 7} more</summary>
              <ul className="divide-y divide-line">{list.slice(7).map((t) => <TodoRow key={t.key} t={t} />)}</ul>
            </details>
          )}
        </>
      ) : (
        <p className="empty">{view === 'client' ? 'Nothing is waiting on a client.' : 'Nothing needs doing right now.'}</p>
      )}
    </section>
  )
}

const upcomingIcon = { visit: 'pin', report: 'report', invoice: 'wallet' } as const

function ComingUp({ items }: { items: Upcoming[] }) {
  const groups = new Map<string, Upcoming[]>()
  for (const i of items) {
    const date = day(i.on_date)
    const n = daysUntil(date)
    const label = !date ? 'Date to confirm' : n !== null && n < 0 ? 'Overdue' : dayLabel(date)
    groups.set(label, [...(groups.get(label) ?? []), i])
  }
  return (
    <section className="panel" aria-labelledby="coming-up">
      <div className="panel-head"><h2 id="coming-up">Coming up</h2><Link href="/staff/inspections" className="text-sm">Schedule</Link></div>
      {!items.length ? (
        <p className="panel-pad text-sm text-muted">Nothing booked or due in the next 14 days.</p>
      ) : (
        <div className="pb-2">
          {[...groups].map(([label, rows]) => (
            <div key={label}>
              <p className={`px-6 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide ${label === 'Overdue' ? 'text-bad' : 'text-muted'}`}>{label}</p>
              <ul>
                {rows.map((i) => (
                  <li key={i.kind + i.href}>
                    <Link href={i.href} className="row-link py-2.5">
                      <span className={`tile ${label === 'Overdue' ? 'tile--bad' : i.status === 'in_progress' ? 'tile--info' : ''}`}><AppIcon name={upcomingIcon[i.kind]} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="row-link__title truncate">{i.title}</span>
                        <span className="row-link__meta">{[i.status === 'in_progress' ? 'In progress' : i.kind === 'visit' ? arrivalLabel(i.arrival) : null, i.meta].filter(Boolean).join(' · ')}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function PipelineRow({ stages, health, closedMonth }: { stages: Partial<Record<ProjectStage, number>>; health: Partial<Record<Health, number>>; closedMonth: number }) {
  const healthOrder: Health[] = ['high_risk', 'at_risk', 'on_track', 'not_assessed']
  return (
    <section className="panel" aria-labelledby="pipeline">
      <div className="panel-head"><h2 id="pipeline">Pipeline</h2><Link href="/staff/projects?stage=all" className="text-sm">All projects</Link></div>
      <div className="panel-pad space-y-4">
        <ol className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-6">
          {projectStages.filter((s) => s !== 'closed').map((s) => {
            const n = stages[s] ?? 0
            return (
              <li key={s} className="bg-white">
                <Link href={`/staff/projects?stage=${s}`} className="flex h-full flex-col justify-between p-3 no-underline hover:bg-paper">
                  <span className="block text-xs text-muted">{stageLabels[s]}</span>
                  <span className={`mt-1 block text-2xl font-semibold ${n ? 'text-ink' : 'text-line-strong'}`}>{n}</span>
                </Link>
              </li>
            )
          })}
        </ol>
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          {healthOrder.filter((h) => health[h]).map((h) => <span key={h} className={`chip chip--${healthChip[h]}`}>{health[h]} {healthLabels[h].toLowerCase()}</span>)}
          <span className="text-muted">{closedMonth} closed this month</span>
        </p>
      </div>
    </section>
  )
}

function MoneyPanel({ money }: { money: Money }) {
  const invoices = (n: number) => `${n} invoice${n === 1 ? '' : 's'}`
  const figures = [
    { label: 'Deposits due', value: kes(money.deposits_kes), foot: invoices(money.deposits_n), href: '/staff/projects?need=unpaid', warn: false },
    { label: 'Balances to collect', value: kes(money.balance_kes), foot: money.overdue_kes ? `${invoices(money.balance_n)} · ${kes(money.overdue_kes)} overdue` : invoices(money.balance_n), href: '/staff/projects?stage=all&need=balance', warn: money.overdue_kes > 0 },
    { label: 'Received this month', value: kes(money.paid_month_kes), foot: 'Payments less refunds', href: '/staff/revenue', warn: false },
  ]
  return (
    <section className="panel" aria-labelledby="money">
      <div className="panel-head"><h2 id="money">Money</h2><Link href="/staff/revenue" className="text-sm">Revenue</Link></div>
      <dl className="panel-pad grid gap-4 sm:grid-cols-3">
        {figures.map((f) => (
          <div key={f.label}>
            <dt className="text-sm text-muted"><Link href={f.href} className="text-muted no-underline hover:underline">{f.label}</Link></dt>
            <dd className="mt-1 text-2xl font-semibold text-ink">{f.value}</dd>
            <dd className={`mt-0.5 text-xs ${f.warn ? 'font-semibold text-bad' : 'text-muted'}`}>{f.foot}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function ActivityFeed({ events }: { events: Activity[] }) {
  const groups = new Map<string, Activity[]>()
  for (const e of events) {
    const label = dayLabel(kenyaDay(new Date(e.created_at)))
    groups.set(label, [...(groups.get(label) ?? []), e])
  }
  return (
    <section className="panel" aria-labelledby="activity">
      <div className="panel-head"><h2 id="activity">Recent activity</h2><Link href="/staff/activity" className="text-sm">All activity</Link></div>
      {!events.length ? <p className="empty">Nothing yet.</p> : (
        <div className="pb-2">
          {[...groups].map(([label, rows]) => (
            <div key={label}>
              <p className="px-6 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
              <ul>
                {rows.map((e) => (
                  <li key={e.id} className="px-6 py-2 text-sm">
                    {e.href ? <Link href={e.href} className="text-ink no-underline hover:underline">{e.summary}</Link> : <span className="text-ink">{e.summary}</span>}
                    <span className="block text-xs text-muted">{[e.ref, e.actor_name ?? 'System', kenyaTime(new Date(e.created_at))].filter(Boolean).join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function AdminOverview({ denied, todo, view, upcoming, money, stages, health, activity }: {
  denied?: string; todo: Todos; view: TodoView; upcoming: Upcoming[]; money: Money
  stages: Partial<Record<ProjectStage, number>>; health: Partial<Record<Health, number>>; activity: Activity[]
}) {
  const week = upcoming.filter((u) => { const n = daysUntil(day(u.on_date)); return u.kind === 'visit' && n !== null && n >= 0 && n <= 7 }).length
  const owed = money.deposits_kes + money.balance_kes
  const summary = [
    todo.count ? `${todo.count} ${todo.count === 1 ? 'thing needs' : 'things need'} doing` : 'Nothing needs doing',
    `${week} visit${week === 1 ? '' : 's'} this week`,
    owed ? `${kes(owed)} to collect` : null,
  ].filter(Boolean).join(' · ')
  const first = todo.all.find((t) => !t.closed)
  return (
    <div className="space-y-5">
      <PageHeader title="Business overview" intro={summary}>
        {first ? <Link className="btn btn-primary btn-small" href={first.href}>Start next task</Link> : <Link className="btn btn-secondary btn-small" href="/staff/projects">All projects</Link>}
      </PageHeader>
      {denied && <p className="alert alert-warn">That page needs a different role.</p>}
      {/* Two columns on wide screens. On smaller screens the wrappers dissolve, so the order reads to do, coming up, pipeline, money, activity. */}
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
        <div className="contents xl:block xl:space-y-4">
          <div className="order-1"><TodoList todo={todo} view={view} /></div>
          <div className="order-3"><PipelineRow stages={stages} health={health} closedMonth={money.closed_month} /></div>
          <div className="order-4"><MoneyPanel money={money} /></div>
        </div>
        <div className="contents xl:block xl:space-y-4">
          <div className="order-2"><ComingUp items={upcoming} /></div>
          <div className="order-5"><ActivityFeed events={activity} /></div>
        </div>
      </div>
    </div>
  )
}

export default async function StaffWorkHome({ searchParams: promise }: { searchParams: Promise<{ denied?: string; view?: string; todo?: string }> }) {
  const query = await promise
  const user = await requireStaff()
  const manager = user.role !== 'field_agent'
  const admin = user.role === 'admin'
  if (admin) {
    const [todo, upcoming, money, stages, health, activity] = await Promise.all([adminTodo(user.id), adminUpcoming(), adminMoney(), projectStageCounts(), projectHealthCounts(), recentActivity(5)])
    const view: TodoView = query.todo === 'mine' || query.todo === 'client' ? query.todo : 'all'
    return <AdminOverview denied={query.denied} todo={todo} view={view} upcoming={upcoming} money={money} stages={stages} health={health} activity={activity} />
  }
  const team = query.view === 'team' || (admin && query.view !== 'mine')
  const [myTasks, teamTasks, stats, health, stages, visits, threads, notes] = await Promise.all([
    manager ? staffWorkQueue(user.id, false, true) : [],
    manager ? staffWorkQueue(user.id, true, true) : [],
    manager ? staffStats() : null,
    manager ? projectHealthCounts() : null,
    manager ? projectStageCounts(user.id) : null,
    upcomingInspections(manager ? undefined : user.id, manager ? user.id : undefined),
    manager ? threadsAwaitingReply(user.id) : [],
    unreadNotifications(user.id, 5),
  ])
  const tasks = team ? teamTasks : myTasks
  const firstName = user.full_name.split(' ')[0]

  const updates = notes.length > 0 && (
    <details className="panel" id="updates" open>
      <summary className="panel-head cursor-pointer"><h2>Recent updates ({notes.length})</h2></summary>
      <ul className="divide-y divide-line">
        {notes.map((n) => (
          <li key={n.id} className="px-6 py-3 text-sm">
            {n.href ? <Link href={n.href}>{n.title}</Link> : n.title}
            {n.body && <p className="mt-1 whitespace-pre-line text-ink-2">{n.body}</p>}
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
          <OpenTasks tasks={tasks} personal={!team} />
          {!team && teamTasks.length>0&&<Link className="btn btn-secondary btn-small" href="/staff?view=team">View all team work ({teamTasks.length})</Link>}
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
