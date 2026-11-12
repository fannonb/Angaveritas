import { briefProfile, briefStageLabels } from '@/lib/service-briefs'
import Link from 'next/link'
import { PageHeader } from '@/components/app/AppTopbar'
import { HealthChip, ProjectMap, ProjectProgress, RequestChip, Timeline } from '@/components/app/bits'
import { Metric } from '@/components/app/dashboard'
import { fmtDate, fmtDateTime, kes } from '@/components/app/format'
import { AppIcon } from '@/components/app/icons'
import Pager from '@/components/app/Pager'
import VisitPlan, { showVisitPlan } from '@/components/app/VisitPlan'
import { requireClient } from '@/lib/auth/session'
import { clientActivity, clientBalancesDue, clientDepositsDue, clientReportsToRead, clientStats } from '@/lib/data/dashboard'
import { clientLatestUnreadHref, clientUnreadCount } from '@/lib/data/messages'
import { unreadNotificationCount, unreadNotifications } from '@/lib/data/misc'
import { dismissNotificationAction, markAllReadAction, openNotificationAction } from '@/app/notification-actions'
import { NotificationButton } from '@/components/app/NotificationPanel'
import { listInspections } from '@/lib/data/inspections'
import { unpaidInvoices } from '@/lib/data/operations'
import { listProjectsForClient } from '@/lib/data/projects'
import { listReports } from '@/lib/data/reports'
import { projectProgress, type ProgressStep } from '@/lib/workflow'
import { listRequestsForClient, openRequestStatuses } from '@/lib/data/requests'
import { clientStageLabels } from '@/lib/labels'

export const metadata = { title: 'Dashboard' }

type ClientProject = Awaited<ReturnType<typeof listProjectsForClient>>[number]

// Shown when no project is open. Completed work stays on the Projects page.
function AllCaughtUp({ completed }: { completed: number }) {
  return (
    <section className="panel panel-pad space-y-3" aria-labelledby="caught-up">
      <h2 id="caught-up" className="text-xl">Nothing open right now</h2>
      <p className="text-ink-2">
        {completed ? 'Your completed work and reports stay available.' : 'Your next project will appear here.'} Start something new, or message your analyst with a question.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link className="btn btn-primary btn-small" href="/estimate">Get an estimate</Link>
        <Link className="btn btn-secondary btn-small" href="/portal/messages">Message your analyst</Link>
        {completed > 0 && <Link className="btn btn-secondary btn-small" href="/portal/reports">Your reports</Link>}
      </div>
    </section>
  )
}

// The project the client is most concerned with, with the one thing that happens next.
function ProjectHero({ p, action, paymentPending, steps }: { p: ClientProject; action?: {href:string;title:string;text:string}; paymentPending:boolean; steps: ProgressStep[] }) {
  const profile = briefProfile(p)
  const labels = briefStageLabels(profile)
  const done = p.stage === 'closed'
  const next = action ? action.text : paymentPending ? 'Your payment reference is with our team. We will confirm it here; there is no need to pay again.' : done
    ? 'Complete. Your reports, messages and payment records stay available. Ask for a follow-up whenever you need more work.'
    : p.next_inspection
      ? `Next ${profile.activity.toLowerCase()} ${fmtDate(p.next_inspection)}. We share photos and findings once the visit is reviewed.`
      : p.published_reports > 0
        ? 'Your report is published. Open the project for the findings and any balance still due.'
        : 'Your analyst is working on the next step. Messages and updates appear here.'
  return (
    <section className="panel panel-pad space-y-4" aria-labelledby="current-project">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="kicker">{p.code}{p.location_label ? ` · ${p.location_label}` : ''}</p>
          <h2 id="current-project" className="mt-1 text-xl">{p.title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`chip ${done ? 'chip--ok' : 'chip--info'}`}>{done ? 'Complete' : (labels[p.stage] ?? clientStageLabels[p.stage])}</span>
          {!done && <HealthChip health={p.health} />}
        </div>
      </div>
      {/* Until the visit, the plan shows what is ready, what we are arranging and the booked date. After it, every step and who it waits on. */}
      {showVisitPlan(p) ? <div className="border-t border-line pt-4"><VisitPlan project={p} paymentPending={paymentPending} embedded /></div>
        : done ? <p className="text-ink-2">{next}</p>
        : <>
            <div className="border-t border-line pt-4"><ProjectProgress steps={steps} viewer="client" /></div>
            {(action || paymentPending) && <div><p className="kicker">Your next step</p>{action && <h3 className="mt-1 text-lg">{action.title}</h3>}<p className="mt-2 text-ink-2">{next}</p></div>}
          </>}
      <div className="flex flex-wrap gap-2">
        <Link className="btn btn-primary btn-small" href={action?.href ?? `/portal/projects/${p.code}`}>{action ? 'Continue' : 'View project progress'}</Link>
        {done ? (
          <Link className="btn btn-secondary btn-small" href={`/estimate?project=${p.code}`}>Request a follow-up</Link>
        ) : (
          p.published_reports > 0 && <Link className="btn btn-secondary btn-small" href={`/portal/projects/${p.code}?tab=reports`}>View reports</Link>
        )}
      </div>
    </section>
  )
}

export default async function Dashboard({ searchParams: searchParamsPromise }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const searchParams = await searchParamsPromise
  const user = await requireClient()
  const [updates, updateCount, stats, projects, requests, activity, unread, deposits, toRead, balances] = await Promise.all([
    unreadNotifications(user.id, 4),
    unreadNotificationCount(user.id),
    clientStats(user.id),
    listProjectsForClient(user.id),
    listRequestsForClient(user.id),
    clientActivity(user.id, Number(searchParams.activity) || 1, 5),
    clientUnreadCount(user.id),
    clientDepositsDue(user.id),
    clientReportsToRead(user.id),
    clientBalancesDue(user.id),
  ])
  const unreadHref = unread ? await clientLatestUnreadHref(user.id) : null
  const openRequests = requests.filter((r) => openRequestStatuses.includes(r.status))
  // The home shows open work only. Completed projects are counted here and listed on the Projects page.
  const open = projects.filter((p) => p.stage !== 'closed')
  const completed = projects.filter((p) => p.stage === 'closed')
  const hero = open[0]
  // The open project at the top of the home shows every step and who it waits on.
  const heroSteps = hero ? projectProgress(hero, await listInspections(hero.id), await listReports(hero.id, true), (await unpaidInvoices(hero.id)).reduce((s, u) => s + u.unpaid_kes, 0), (d) => fmtDate(d)) : []
  const others = open.slice(1)
  const firstName = user.full_name.split(' ')[0]

  // Things only the client can move forward.
  const todo: { href: string; title: string; text: string; icon: string }[] = [
    ...requests.filter((r) => r.status === 'proposal_sent').map((r) => ({ href: `/portal/requests/${r.reference}`, title: `Review your proposal for ${r.title}`, text: 'Accept online to start the work, or ask us a question.', icon: 'report' })),
    ...projects.filter((p) => p.stage !== 'closed' && (!p.onboarding_submitted_at || !p.data_consent_at)).map((p) => ({ href: `/portal/projects/${p.code}?tab=onboarding`, title: `Review ${briefProfile(p).tab.toLowerCase()} and consent for ${p.title}`, text: 'Complete the service brief, your priorities and permission to carry out the work.', icon: 'pin' })),
    ...deposits.filter((d) => !d.payment_notified && !balances.some(b=>b.project_code===d.project_code&&b.invoice_code===d.invoice_code)).map((d) => ({ href: `/portal/projects/${d.project_code}?tab=operations`, title: `Pay deposit of ${kes(d.due_kes)} for ${d.project_title}`, text: `60% of the approved fee is due before work starts. Open invoice ${d.invoice_code} to pay.`, icon: 'wallet' })),
    ...balances.filter(b=>!b.payment_notified).map(b=>({href:`/portal/projects/${b.project_code}?tab=operations`,title:`Pay remaining ${kes(b.due_kes)} for ${b.project_title}`,text:`Invoice ${b.invoice_code}. Your final report opens once this is settled.`,icon:'wallet'})),
    ...projects.filter((p) => p.stage !== 'closed' && p.nda_status === 'prepared').map((p) => ({ href: `/portal/projects/${p.code}?tab=agreement`, title: `Sign the confidentiality agreement for ${p.title}`, text: 'Your agreement is ready. Review and sign it before fieldwork starts.', icon: 'review' })),
    ...toRead.map((r) => ({ href: `/portal/projects/${r.project_code}/reports/${r.id}`, title: `Your report is ready: ${r.project_title}`, text: 'Read the findings and our recommendation.', icon: 'report' })),
    ...(unread && unreadHref ? [{ href: unreadHref, title: `${unread} unread message${unread > 1 ? 's' : ''} from your analyst`, text: unread > 1 ? 'Opens the latest conversation. Others are marked in your projects and requests.' : 'Open the conversation to reply.', icon: 'message' }] : []),
  ]

  return (
    <div className="space-y-5">
      <PageHeader title={searchParams.welcome ? `Welcome, ${firstName}` : `Hello, ${firstName}`} intro="Your investments, verified on the ground.">
        <Link className={`btn ${projects.length || requests.length ? 'btn-secondary' : 'btn-primary'}`} href="/estimate">New enquiry</Link>
      </PageHeader>

      {searchParams.welcome && (
        <p className="alert alert-ok">
          Your account is ready. Confirm your email with the link we sent, then start with an <Link href="/estimate">estimate</Link>. Your
          proposals, site evidence and reports will all appear here.
        </p>
      )}
      {searchParams.verified && <p className="alert alert-ok">Thank you, your email address is confirmed.</p>}

      {updates.length > 0 && (
        <section className="panel" aria-labelledby="updates">
          <div className="panel-head">
            <h2 id="updates">New updates <span className="text-muted">({updateCount})</span></h2>
            <form action={markAllReadAction}><button className="linkish text-sm" type="submit">Dismiss all</button></form>
          </div>
          <ul className="divide-y divide-line">
            {updates.map((n) => (
              <li key={n.id} className="flex items-start gap-3 px-6 py-3.5">
                <span className="tile mt-0.5"><AppIcon name="bell" /></span>
                <div className="min-w-0 flex-1">
                  {n.href ? (
                    <form action={openNotificationAction}>
                      <input type="hidden" name="id" value={n.id} />
                      <button type="submit" className="row-link__title cursor-pointer border-0 bg-transparent p-0 text-left hover:underline">{n.title}</button>
                    </form>
                  ) : <p className="row-link__title">{n.title}</p>}
                  {n.body && <p className="mt-0.5 line-clamp-2 text-sm text-ink-2">{n.body}</p>}
                  <p className="row-link__meta">{fmtDateTime(n.created_at, user.timezone ?? undefined)}</p>
                </div>
                <form action={dismissNotificationAction}>
                  <input type="hidden" name="id" value={n.id} />
                  <button type="submit" aria-label={`Dismiss: ${n.title}`} title="Dismiss" className="grid h-8 w-8 place-items-center rounded-full border-0 bg-transparent text-lg leading-none text-muted hover:bg-paper hover:text-ink">×</button>
                </form>
              </li>
            ))}
          </ul>
          {updateCount > updates.length && <p className="border-t border-line px-6 py-3 text-sm"><NotificationButton variant="text">See all updates</NotificationButton></p>}
        </section>
      )}
      {todo.length === 0 && projects.length>0 && updates.length === 0 && <p className="alert alert-ok">You are up to date. Nothing needs your action right now. We will show your next task here.</p>}
      {[...deposits,...balances].some(d=>d.payment_notified)&&<p className="alert alert-info">Payment confirmation is with our team. You do not need to pay again while we check your reference.</p>}
      {todo.length > 0 && (
        <section className="panel" aria-labelledby="todo">
          <div className="panel-head">
            <h2 id="todo">Your next actions</h2>
            <span className="chip chip--warn chip--plain">{todo.length} to do</span>
          </div>
          <p className="px-6 pt-3 text-sm text-muted">Start with the first item. Each link takes you straight to the task.</p>
          <ul className="divide-y divide-line">
            {todo.map((t, index) => (
              <li key={t.href + t.title}>
                <Link href={t.href} className="row-link flex-wrap gap-y-2 py-4">
                  <span className={`tile ${index === 0 ? '' : 'tile--none'}`}><AppIcon name={t.icon} /></span>
                  <span className="min-w-0 flex-1 basis-48">
                    <span className="row-link__title">{t.title}</span>
                    <span className="mt-0.5 block text-sm text-ink-2">{t.text}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold">{index===0 ? 'Start here →' : 'Open →'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {projects.length + requests.length === 0 ? (
        <section className="panel panel-pad">
          <h2 className="text-xl">Start with an estimate</h2>
          <p className="mt-2 max-w-2xl text-ink-2">
            Tell us what you need checked and where. You get an itemised estimate straight away; we then send a proposal you can
            accept here. After that you follow every step: the fieldwork, the evidence and the final report.
          </p>
          <ol className="steps steps--4 mt-6">
            <li><h3>Estimate</h3><p>Six quick steps, itemised.</p></li>
            <li><h3>Proposal</h3><p>Scope and price, accepted online.</p></li>
            <li><h3>Site visit</h3><p>Photos, video, GPS, interviews.</p></li>
            <li><h3>Report</h3><p>Findings, risks, recommendation.</p></li>
          </ol>
          <div className="actions mt-6">
            <Link className="btn btn-primary" href="/estimate">Get an estimate</Link>
            <Link className="btn btn-secondary" href="/sample-report">See a sample report</Link>
          </div>
        </section>
      ) : (
        <>
          {hero ? <ProjectHero p={hero} steps={heroSteps} action={todo.find(t=>t.href.startsWith(`/portal/projects/${hero.code}`))} paymentPending={[...deposits,...balances].some(d=>d.project_code===hero.code&&d.payment_notified)} /> : <AllCaughtUp completed={completed.length} />}

          {projects.length > 0 && (
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Summary">
              <Metric label="Open projects" value={open.length} href="/portal/projects" foot="Work in progress" />
              <Metric label="Reports published" value={stats.reports} href="/portal/reports" foot="Findings and recommendations" />
              <Metric label="Visits this month" value={stats.inspections_month} foot="Reviewed and released to you" />
              <Metric label="Open risk alerts" value={stats.alerts} foot={stats.alerts ? 'See the project for details' : 'Nothing needs a decision'} />
            </section>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
            <div className="space-y-4">
              {others.length > 0 && (
                <section className="panel" aria-labelledby="other-projects">
                  <div className="panel-head">
                    <h2 id="other-projects">Other open projects</h2>
                    <Link href="/portal/projects" className="text-sm">All projects</Link>
                  </div>
                  <ul className="divide-y divide-line">
                    {others.map((p) => (
                      <li key={p.id}>
                        <Link href={`/portal/projects/${p.code}`} className="row-link items-start py-4">
                          <span className="tile mt-0.5"><AppIcon name="folder" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center justify-between gap-2">
                              <span className="row-link__title">{p.title}</span>
                              <HealthChip health={p.health} />
                            </span>
                            <span className="row-link__meta">
                              <span className="font-mono">{p.code}</span>
                              {p.location_label && ` · ${p.location_label}`}
                              {p.next_inspection && ` · Next visit ${fmtDate(p.next_inspection)}`}
                              {p.published_reports > 0 && ` · ${p.published_reports} report${p.published_reports > 1 ? 's' : ''}`}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {openRequests.length > 0 && (
                <section className="panel" aria-labelledby="requests">
                  <div className="panel-head">
                    <h2 id="requests">Waiting to start</h2>
                    <Link href="/portal/projects" className="text-sm">All projects</Link>
                  </div>
                  <ul className="divide-y divide-line">
                    {openRequests.map((r) => (
                      <li key={r.id}>
                        <Link href={`/portal/requests/${r.reference}`} className="row-link flex-wrap gap-y-2 py-4">
                          <span className="tile tile--info"><AppIcon name="inbox" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="row-link__title">{r.title}</span>
                            <span className="row-link__meta">{r.reference} · {r.service_name ?? 'Custom request'}{r.total_kes ? ` · est. ${kes(r.total_kes)}` : ''}</span>
                          </span>
                          <RequestChip status={r.status} client />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {completed.length > 0 && (
                <section className="panel panel-pad flex flex-wrap items-center justify-between gap-3" aria-label="Completed projects">
                  <p className="text-ink-2"><strong className="text-ink">{completed.length} completed {completed.length === 1 ? 'project' : 'projects'}</strong> · reports and records stay available</p>
                  <Link className="btn btn-secondary btn-small" href="/portal/projects#completed">View all</Link>
                </section>
              )}
              {open.length > 0 && (
                <details className="panel">
                  <summary className="panel-head cursor-pointer"><h2>Project locations</h2></summary>
                  <div className="panel-pad">
                    <ProjectMap projects={open} hrefFor={(p) => `/portal/projects/${p.code}`} />
                  </div>
                </details>
              )}
            </div>

            <section className="panel" aria-labelledby="activity">
              <div className="panel-head">
                <h2 id="activity">Recent activity</h2>
                <span className="text-xs text-muted">Latest updates</span>
              </div>
              <div className="panel-pad space-y-4">
                <Timeline events={activity.items} tz={user.timezone} />
                <Pager page={activity.page} pages={activity.pages} label="Activity pages" hrefFor={(n) => `/portal?activity=${n}#activity`} />
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
