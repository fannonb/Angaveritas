import Link from 'next/link'
import { PageHeader } from '@/components/app/AppTopbar'
import { HealthChip, ProjectMap, RequestChip, Timeline } from '@/components/app/bits'
import { Metric } from '@/components/app/dashboard'
import { fmtDate, kes } from '@/components/app/format'
import { AppIcon } from '@/components/app/icons'
import Pager from '@/components/app/Pager'
import { requireClient } from '@/lib/auth/session'
import { clientActivity, clientDepositsDue, clientReportsToRead, clientStats } from '@/lib/data/dashboard'
import { clientLatestUnreadHref, clientUnreadCount } from '@/lib/data/messages'
import { listProjectsForClient } from '@/lib/data/projects'
import { listRequestsForClient, openRequestStatuses } from '@/lib/data/requests'
import { clientStageLabels, type ProjectStage } from '@/lib/labels'

export const metadata = { title: 'Dashboard' }

// The client-facing journey, for the progress bar on each project.
const journey: ProjectStage[] = ['onboarding', 'planning', 'fieldwork', 'analysis', 'delivered']
function progress(stage: ProjectStage) {
  const at = stage === 'monitoring' || stage === 'closed' ? journey.length - 1 : journey.indexOf(stage)
  return { step: at + 1, of: journey.length, pct: Math.round(((at + 1) / journey.length) * 100) }
}

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
function ProjectHero({ p }: { p: ClientProject }) {
  const done = p.stage === 'closed'
  const at = progress(p.stage)
  const next = done
    ? 'Complete. Your reports, messages and payment records stay available. Ask for a follow-up whenever you need more work.'
    : p.next_inspection
      ? `Next site visit ${fmtDate(p.next_inspection)}. We share photos and findings once the visit is reviewed.`
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
          <span className={`chip ${done ? 'chip--ok' : 'chip--info'}`}>{done ? 'Complete' : clientStageLabels[p.stage]}</span>
          {!done && <HealthChip health={p.health} />}
        </div>
      </div>
      {!done && (
        <div className="flex items-center gap-3">
          <span className="meter flex-1" role="progressbar" aria-valuenow={at.step} aria-valuemin={1} aria-valuemax={at.of} aria-label={`Step ${at.step} of ${at.of}: ${clientStageLabels[p.stage]}`}>
            <span style={{ width: `${at.pct}%` }} />
          </span>
          <span className="shrink-0 text-xs font-semibold text-ink-2">{at.step}/{at.of}</span>
        </div>
      )}
      <p className="text-ink-2">{next}</p>
      <div className="flex flex-wrap gap-2">
        <Link className="btn btn-primary btn-small" href={`/portal/projects/${p.code}`}>Open project</Link>
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
  const [stats, projects, requests, activity, unread, deposits, toRead] = await Promise.all([
    clientStats(user.id),
    listProjectsForClient(user.id),
    listRequestsForClient(user.id),
    clientActivity(user.id, Number(searchParams.activity) || 1),
    clientUnreadCount(user.id),
    clientDepositsDue(user.id),
    clientReportsToRead(user.id),
  ])
  const unreadHref = unread ? await clientLatestUnreadHref(user.id) : null
  const openRequests = requests.filter((r) => openRequestStatuses.includes(r.status))
  // The home shows open work only. Completed projects are counted here and listed on the Projects page.
  const open = projects.filter((p) => p.stage !== 'closed')
  const completed = projects.filter((p) => p.stage === 'closed')
  const hero = open[0]
  const others = open.slice(1)
  const firstName = user.full_name.split(' ')[0]

  // Things only the client can move forward.
  const todo: { href: string; title: string; text: string; icon: string }[] = [
    ...requests.filter((r) => r.status === 'proposal_sent').map((r) => ({ href: `/portal/requests/${r.reference}`, title: `Review your proposal for ${r.title}`, text: 'Accept online to start the work, or ask us a question.', icon: 'report' })),
    ...projects.filter((p) => p.stage !== 'closed' && (!p.onboarding_submitted_at || !p.data_consent_at)).map((p) => ({ href: `/portal/projects/${p.code}?tab=onboarding`, title: `Review site details and consent for ${p.title}`, text: 'Confirm the location, what we should check and your permission to carry out the work.', icon: 'pin' })),
    ...deposits.filter((d) => !d.payment_notified).map((d) => ({ href: `/portal/projects/${d.project_code}?tab=operations`, title: `Pay ${kes(d.due_kes)} for ${d.project_title}`, text: `We book the site visit once it arrives. Use invoice ${d.invoice_code} as the reference.`, icon: 'wallet' })),
    ...projects.filter((p) => p.nda_status === 'prepared').map((p) => ({ href: `/portal/projects/${p.code}?tab=agreement`, title: `Sign the confidentiality agreement for ${p.title}`, text: 'Your agreement is ready. Review and sign it before fieldwork starts.', icon: 'review' })),
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
      {searchParams.verification_sent && <p className="alert alert-ok">We sent a new confirmation link to {user.email}.</p>}

      {todo.length > 0 && (
        <section className="panel" aria-labelledby="todo">
          <div className="panel-head">
            <h2 id="todo">Needs your attention</h2>
            <span className="chip chip--warn chip--plain">{todo.length} to do</span>
          </div>
          <ul className="divide-y divide-line">
            {todo.map((t, index) => (
              <li key={t.href + t.title}>
                <Link href={t.href} className="row-link py-4">
                  <span className={`tile ${index === 0 ? '' : 'tile--none'}`}><AppIcon name={t.icon} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="row-link__title">{t.title}</span>
                    <span className="mt-0.5 block text-sm text-ink-2">{t.text}</span>
                  </span>
                  <AppIcon name="arrowRight" className="shrink-0 text-muted" />
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
            accept here. After that you follow every step: the site visit, the evidence and the final report.
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
          {hero ? <ProjectHero p={hero} /> : <AllCaughtUp completed={completed.length} />}

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
                        <Link href={`/portal/requests/${r.reference}`} className="row-link py-4">
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
