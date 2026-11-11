import EngagementPanel from '@/components/app/EngagementPanel'
import { briefProfile, briefStageLabels, suggestedChecks } from '@/lib/service-briefs'
import ServiceBriefSummary from '@/components/app/ServiceBriefSummary'
import OperationsPanel from '@/components/app/OperationsPanel'
import { sql } from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrivalFields, HealthChip, InspectionChip, ProjectProgress, ReportChip, StageTracker, Tabs, Timeline } from '@/components/app/bits'
import EvidenceGallery, { DocumentList } from '@/components/app/EvidenceGallery'
import { fmtDate, fmtDateTime, fmtVisit, kes } from '@/components/app/format'
import { AppIcon } from '@/components/app/icons'
import Messages from '@/components/app/Messages'
import Uploader from '@/components/app/Uploader'
import VisitReadiness from '@/components/app/VisitReadiness'
import { requireStaff } from '@/lib/auth/session'
import { listProjectFiles } from '@/lib/data/files'
import { listInspections } from '@/lib/data/inspections'
import { listMessages, markRead } from '@/lib/data/messages'
import { listContacts, projectByCodeFor, projectEvents } from '@/lib/data/projects'
import { projectDepositDue, unpaidInvoices } from '@/lib/data/operations'
import { openReopenRequest } from '@/lib/data/engagements'
import { listReports } from '@/lib/data/reports'
import { listAssignableStaff } from '@/lib/data/users'
import { paymentStatusLabels } from '@/lib/labels'
import { closedProjectNextStep, projectProgress, staffNextStep } from '@/lib/workflow'
import { createInspectionAction, createReportAction, staffAddContactAction, staffMessageAction, staffRemoveContactAction } from '../../actions'
import FileControls from '../../FileControls'
import ManageForm from './ManageForm'
import { staffOperationsAction } from '@/app/staff/operations-actions'
import TeamForm from './TeamForm'

export const metadata = { title: 'Project' }

const ALL = ['overview', 'site', 'inspections', 'evidence', 'reports', 'messages', 'activity', 'operations', 'agreement', 'monitoring', 'settings', 'alerts'] as const
type Tab = (typeof ALL)[number]
// Documents now live on Site & files (client and internal) and Reports (PDFs); old links still land there.
const moved: Record<string, Tab> = { documents: 'site' }

export default async function StaffProject({ params: paramsPromise, searchParams: searchParamsPromise }: { params: Promise<{ code: string }>; searchParams: Promise<{ tab?: string; error?: string; saved?: string }> }) {
  const params = await paramsPromise
  const searchParams = await searchParamsPromise
  const user = await requireStaff()
  const access = await projectByCodeFor(user, params.code)
  if (!access) notFound()
  const p = access.project
  const profile = briefProfile(p)
  const journeyLabels = briefStageLabels(profile)
  const sites = await sql`select id,label from project_sites where project_id=${p.id} order by primary_site desc,label`
  const allowed: readonly Tab[] = access.canManage ? ALL : ['site', 'inspections', 'evidence']
  const wanted = (moved[searchParams.tab ?? ''] ?? searchParams.tab) as Tab
  const tab: Tab = allowed.includes(wanted) ? wanted : allowed[0]

  const [inspections, contacts, evidence, clientDocs, internal, reportFiles, reports, messages, events, staff, unpaid] = await Promise.all([
    listInspections(p.id),
    listContacts(p.id),
    listProjectFiles(p.id, { clientView: false, category: 'evidence', fieldAgentId: user.role === 'field_agent' ? user.id : undefined }),
    listProjectFiles(p.id, { clientView: false, category: 'client_document', fieldAgentId: user.role === 'field_agent' ? user.id : undefined }),
    access.canManage ? listProjectFiles(p.id, { clientView: false, category: 'internal' }) : [],
    access.canManage ? listProjectFiles(p.id, { clientView: false, category: 'report' }) : [],
    access.canManage ? listReports(p.id, false) : [],
    access.canManage ? listMessages({ projectId: p.id }, true) : [],
    access.canManage ? projectEvents(p.id, false, p.request_id) : [],
    access.canManage ? listAssignableStaff() : [],
    access.canManage ? unpaidInvoices(p.id) : [],
  ])
  if (tab === 'messages') await markRead({ projectId: p.id }, user.id)
  const deposit = access.canManage ? await projectDepositDue(p.id) : null
  const flagged = evidence.filter((e) => e.integrity_flag && !e.visible_to_client).length
  const href = (t: Tab) => `/staff/projects/${p.code}?tab=${t}`
  const reopenAsk = p.stage === 'closed' ? await openReopenRequest(p.id) : null
  const next = access.canManage ? (p.stage === 'closed' ? closedProjectNextStep(user.role === 'admin') : staffNextStep(p, inspections.filter(i=>i.work_order_id===p.active_work_order_id), reports.filter(r=>r.work_order_id===p.active_work_order_id), flagged, unpaid.reduce((s, u) => s + u.unpaid_kes, 0), !!deposit?.payment_notified)) : null
  const labels: Record<Tab, string> = {
    overview: 'Overview',
    site: `${profile.tab} & files`,
    inspections: `Inspections (${inspections.length})`,
    evidence: flagged ? `Evidence (${evidence.length}, ${flagged} to check)` : `Evidence (${evidence.length})`,
    reports: `Reports (${reports.length})`,
    messages: 'Messages',
    activity: 'History',
    operations: 'Billing',
    agreement:'Agreement', monitoring:'Monitoring', settings:'Service & privacy', alerts:'Risk alerts',
  }
  const more: Tab[] = ['agreement', 'monitoring', 'alerts', 'settings']
  const hasLiveVisit = inspections.some((i) => i.work_order_id===p.active_work_order_id && i.status !== 'cancelled')
  const openVisits = inspections.filter((i) => ['scheduled', 'in_progress', 'submitted'].includes(i.status))
  // Until the first visit is booked, the visit is scheduled from the overview, right under the next step that asks for it.
  const planHere = access.canManage && next?.tab === 'inspections' && !hasLiveVisit
  // One analyst doing both roles needs an admin to review their visit and approve their report. An admin doing both just publishes.
  const sameTeam = !!p.lead_analyst_id && p.lead_analyst_id === p.field_agent_id && staff.find((s) => s.id === p.lead_analyst_id)?.role !== 'admin'
  const planForm = access.canManage && (
    <>
      <form action={createInspectionAction} className="mt-3 grid gap-3 md:grid-cols-2 md:items-end">
        <input type="hidden" name="projectId" value={p.id} />
        <label className="label">Title<input className="input" name="title" defaultValue={inspections.length ? `Follow-up visit ${inspections.length + 1}` : profile.activity} maxLength={200} /></label>
        <label className="label">Date<input className="input" type="date" name="scheduledFor" required /></label>
        <label className="label">
          Field agent
          <select className="input" name="agentId" defaultValue={p.field_agent_id ?? ''}>
            <option value="">Project agent</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </label>
        <label className="label">Site<select className="input" name="siteId"><option value="">Primary project location</option>{sites.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        <div className="md:col-span-2"><ArrivalFields /></div>
        <label className="label">Report due <span className="opt">(client sees this)</span><input className="input" type="date" name="dueDate" defaultValue={p.due_date ? String(p.due_date).slice(0, 10) : ''} /></label>
        <label className="label md:col-span-full">Checks for the field agent <span className="opt">(one per line)</span><textarea className="input" name="objectives" defaultValue={suggestedChecks(profile,p.claims)} maxLength={8000} /></label>
        <button className="btn btn-primary justify-self-start whitespace-nowrap" type="submit">Schedule and notify client</button>
      </form>
      <p className="hint mt-2">Suggested from the client&apos;s brief: check them against the accepted scope. The client is emailed the date and arrival time; the field agent gets the checklist.</p>
    </>
  )

  return (
    <div className="space-y-5">
      {searchParams.error && <p role="alert" className="alert alert-bad">{searchParams.error}</p>}
      {searchParams.saved && <p role="status" className="alert alert-ok">Saved.</p>}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
        <Link href="/staff/projects" className="text-slate-500 hover:text-slate-800 transition-colors">Projects</Link>
        <span>/</span>
        <span className="font-mono text-slate-900">{p.code}</span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-brand-text bg-brand-soft px-2 py-0.5 rounded border border-[#ead9b0]">{p.code}</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{p.service_name ?? 'Custom'}</span>
            {p.request_reference && (
              <span className="text-xs text-slate-500">
                from <Link href={`/staff/requests/${p.request_reference}`} className="font-mono underline">{p.request_reference}</Link>
              </span>
            )}
          </div>
          <h1 className="app-title mt-1.5">{p.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{p.client_name}</span>
            {access.canManage && <>· <Link href={`/staff/clients/${p.client_id}`} className="underline text-slate-600 hover:text-slate-900">Client profile</Link></>}
            {p.location_label ? <>· <span>{p.location_label}</span></> : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HealthChip health={p.health} />
          {access.canManage && <span className="chip chip--plain chip--none">{paymentStatusLabels[p.payment_status]}</span>}
        </div>
      </div>
      <section className="panel panel-pad">{access.canManage ? <ProjectProgress steps={projectProgress(p, inspections.filter(i=>i.work_order_id===p.active_work_order_id), reports.filter(r=>r.work_order_id===p.active_work_order_id), unpaid.reduce((s, u) => s + u.unpaid_kes, 0), (d) => fmtDate(d))} viewer="staff" /> : <StageTracker stage={p.stage} retainer={p.engagement === 'retainer'} labels={journeyLabels} />}</section>
      {next && (
        <section className="next-step" aria-label="Next step">
          <div>
            <p className="next-step__label">Next step</p>
            <p className="next-step__title">{next.title}</p>
            <p className="next-step__text">{next.text}</p>
          </div>
          {next.tab !== tab && !(planHere && tab === 'overview') && <Link className="btn btn-primary btn-small" href={href(next.tab)}>Go to {labels[next.tab].replace(/ \(.*\)$/, '')}</Link>}
        </section>
      )}
      {p.stage === 'closed' && user.role === 'admin' && (
        <details id="reopen-project" className="panel panel-pad" open={!!reopenAsk}>
          <summary className="cursor-pointer font-semibold">Reopen project</summary>
          {reopenAsk && <p className="alert alert-warn mt-4">The client asked us to reopen on {fmtDate(reopenAsk.created_at)}: “{reopenAsk.reason}”. Reopening below closes the request.</p>}
          <form action={staffOperationsAction} className="mt-4 space-y-3">
            <p className="hint">The client sees it as open again, and their reports and messages stay as they are. Use this when something is still outstanding and the client needs more work from the team, without a new follow-up project.</p>
            <input type="hidden" name="projectId" value={p.id} />
            <input type="hidden" name="operation" value="reopen_project" />
            <label className="label">Reason<input className="input" name="reason" required minLength={5} maxLength={500} placeholder="e.g. Client asked us to review the access road" /></label>
            <button className="btn btn-secondary btn-small">Reopen project</button>
          </form>
        </details>
      )}
      {!access.canManage && flagged > 0 && <p className="alert alert-warn">{flagged} evidence item{flagged > 1 ? 's' : ''} failed the automatic integrity check and {flagged > 1 ? 'are' : 'is'} held back from the client. <Link href={href('evidence')}>Check evidence</Link></p>}

      <div className="flex flex-wrap items-center gap-2">
        <Tabs active={tab} tabs={allowed.filter(t => !more.includes(t)).map((t) => ({ key: t, label: labels[t], href: href(t) }))} />
        {/* Rarely needed project settings sit behind one menu instead of a second row of links. */}
        {access.canManage && (
          <details className="relative">
            <summary className={`btn btn-secondary btn-small list-none ${more.includes(tab) ? 'border-ink' : ''}`}>{more.includes(tab) ? labels[tab] : 'More'} ▾</summary>
            <ul className="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-line bg-white py-1 shadow-lg">
              {more.map((t) => <li key={t}><Link href={href(t)} aria-current={tab === t ? 'page' : undefined} className={`block px-4 py-2 text-sm no-underline hover:bg-paper ${tab === t ? 'font-semibold text-ink' : 'text-ink-2'}`}>{labels[t]}</Link></li>)}
            </ul>
          </details>
        )}
      </div>

      {/* From acceptance until the visit is booked, one ordered checklist says what is left and who it waits on. */}
      {tab === 'overview' && access.canManage && ['onboarding','planning'].includes(p.stage) && !hasLiveVisit && (
        <VisitReadiness project={p} deposit={deposit} admin={user.role === 'admin'} />
      )}
      {access.canManage && (tab === 'overview' || tab === 'settings') && <EngagementPanel projectId={p.id} manager admin={user.role==='admin'} />}
      {tab === 'overview' && (
        <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr] xl:items-start">
          <div className="space-y-6">
            {planHere && (
              <section className="panel panel-pad" id="plan-visit">
                <h2 className="text-lg">Schedule the {profile.activity.toLowerCase()}</h2>
                {planForm}
              </section>
            )}
            {openVisits.length > 0 && (
              <section className="panel" aria-labelledby="visit-card">
                <div className="panel-head"><h2 id="visit-card">{openVisits.length === 1 ? 'Site visit' : 'Site visits'}</h2>{access.canManage && <Link href={href('inspections')} className="text-sm">Plan another visit</Link>}</div>
                <ul className="divide-y divide-line">
                  {openVisits.map((i) => (
                    <li key={i.id}>
                      <Link href={`/staff/inspections/${i.id}`} className="row-link flex-wrap gap-y-2 py-3.5">
                        <span className={`tile ${i.status === 'submitted' ? 'tile--warn' : i.status === 'in_progress' ? 'tile--info' : ''}`}><AppIcon name="pin" /></span>
                        <span className="min-w-0 flex-1 basis-56">
                          <span className="row-link__title">{i.scheduled_for ? fmtVisit(i.scheduled_for, i.arrival_window) : 'Date not set'}</span>
                          <span className="row-link__meta">{i.code} · {i.title} · {i.agent_name ?? 'No field agent'}</span>
                        </span>
                        <InspectionChip status={i.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="border-t border-line px-6 py-3 text-sm text-ink-2">Report expected {p.due_date ? fmtDate(p.due_date) : <strong className="text-warn">date not set</strong>}. Change dates, arrival or the checklist on the visit.</p>
              </section>
            )}
            {access.canManage && (
              <section className="panel panel-pad" id="team">
                <h2 className="text-lg">Team</h2>
                {p.lead_analyst_id && p.field_agent_id ? (
                  <>
                    <dl className="kv mt-3"><dt>Lead analyst</dt><dd>{p.analyst_name}</dd><dt>Field agent</dt><dd>{p.agent_name}</dd></dl>
                    {sameTeam && <p className="alert alert-warn mt-3">{p.analyst_name} is both lead analyst and field agent. An admin must review their visit and approve their report before the client sees them.</p>}
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-semibold">Change the team</summary>
                      <div className="mt-3"><TeamForm projectId={p.id} leadAnalystId={p.lead_analyst_id} fieldAgentId={p.field_agent_id} staff={staff} /></div>
                    </details>
                  </>
                ) : (
                  <>
                    <p className="hint mt-1">The lead analyst prepares the scope and report. The field agent carries out the site visit.</p>
                    <div className="mt-3"><TeamForm projectId={p.id} leadAnalystId={p.lead_analyst_id} fieldAgentId={p.field_agent_id} staff={staff} /></div>
                  </>
                )}
              </section>
            )}
            {/* Settings, not a step: name, health, report date, site and planning notes. */}
            <details className="panel" open={!access.canManage}>
              <summary className="panel-head cursor-pointer list-none"><h2>Project details</h2><span className="text-sm text-muted">Health, report date, site, planning notes</span></summary>
              <div className="panel-pad">
                <ManageForm p={p} admin={user.role === 'admin'} owedKes={unpaid.reduce((s, u) => s + u.unpaid_kes, 0)} />
              </div>
            </details>
          </div>
          <div className="space-y-6">
            <section className="panel panel-pad">
              <h2 className="text-lg">Commercial overview</h2>
              <dl className="kv mt-3">
                <dt>Contract value</dt><dd>{kes(p.contract_value_kes)}</dd>
                <dt>Payment</dt><dd>{paymentStatusLabels[p.payment_status]} · <Link href={href('operations')}>Billing</Link></dd>
                <dt>Client</dt><dd>{p.client_name}<br /><a href={`mailto:${p.client_email}`}>{p.client_email}</a>{p.client_phone ? <><br />{p.client_phone}</> : null}</dd>
                <dt>Based in</dt><dd>{p.client_based_in ?? '—'}</dd>
                <dt>Onboarding</dt><dd>{p.onboarding_submitted_at ? `Completed ${fmtDate(p.onboarding_submitted_at)}` : 'Awaiting client brief'}</dd>
              </dl>
            </section>
            <section className="panel">
              <div className="panel-head"><h2>Recent activity</h2><Link href={href('activity')} className="text-sm">All</Link></div>
              <div className="panel-pad"><Timeline events={events.slice(0, 8)} staff /></div>
            </section>
          </div>
        </div>
      )}

      {tab === 'site' && (
        <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
          <section className="panel panel-pad">
            <h2 className="text-lg">{profile.title}</h2>
            <div className="mt-4"><ServiceBriefSummary context={p} value={p.service_brief} includeSensitive={access.canManage} /></div>
            <dl className="kv mt-3">
              <dt>{profile.location}</dt><dd>{p.location_label ?? '—'}{p.county ? `, ${p.county}` : ''}{p.location_lat != null && <> · <a href={`https://www.openstreetmap.org/?mlat=${p.location_lat}&mlon=${p.location_lng}#map=15/${p.location_lat}/${p.location_lng}`} target="_blank" rel="noopener noreferrer">map</a></>}</dd>
              <dt>{profile.directions || 'Location notes'}</dt><dd>{p.site_directions ?? '—'}</dd>
              <dt>{profile.access}</dt><dd>{p.site_access_notes ?? '—'}</dd>
              <dt>{profile.claims}</dt><dd>{p.claims ?? '—'}</dd>
              <dt>Client concerns</dt><dd>{p.concerns ?? '—'}</dd>
              {access.canManage && <><dt>Planning notes</dt><dd>{p.planning_notes ?? '—'}</dd></>}
            </dl>
          </section>
          <div className="space-y-6">
            <section className="panel panel-pad space-y-3">
              <h2 className="text-lg">{profile.people}</h2>
              <p className="hint">{profile.peopleHint}</p>
              {contacts.length === 0 && <p className="text-ink-2">None added.</p>}
              <ul className="divide-y divide-line">
                {contacts.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                    <span>
                      <strong>{c.name}</strong>{c.role ? ` · ${c.role}` : ''}
                      <span className="block">{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
                      {c.notes && <span className="block text-muted">{c.notes}</span>}
                      {!c.may_contact && <span className="block font-semibold text-bad">Client says: do not contact without asking</span>}
                    </span>
                    {access.canManage && (
                      <form action={staffRemoveContactAction}>
                        <input type="hidden" name="projectId" value={p.id} />
                        <input type="hidden" name="contactId" value={c.id} />
                        <button className="linkish text-muted" type="submit">Remove</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
              <details>
                <summary className="cursor-pointer text-sm font-semibold">Add a person</summary>
                <form action={staffAddContactAction} className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="projectId" value={p.id} />
                  <input className="input mt-0" name="name" placeholder="Name" required maxLength={120} />
                  <input className="input mt-0" name="role" placeholder="Role" maxLength={120} />
                  <input className="input mt-0" name="phone" placeholder="Phone" maxLength={40} />
                  <input className="input mt-0" name="email" placeholder="Email" maxLength={160} />
                  <input className="input mt-0 sm:col-span-2" name="notes" placeholder="Notes" maxLength={1000} />
                  <button className="btn btn-secondary btn-small" type="submit">Add</button>
                </form>
              </details>
            </section>
            <section className="panel panel-pad space-y-3">
              <h2 className="text-lg">Client documents</h2><ul className="list-disc pl-5 text-sm text-ink-2">{profile.documents.map(item => <li key={item}>{item}</li>)}</ul>
              <DocumentList files={clientDocs} controls={access.canManage ? f => <FileControls f={f} canManage /> : undefined} />
            </section>
            {access.canManage && (
              <section className="panel panel-pad space-y-3">
                <h2 className="text-lg">Internal files</h2>
                <p className="hint">Research, public records, working notes. Never shown to the client.</p>
                <Uploader projectId={p.id} category="internal" label="Upload internal file" />
                <DocumentList files={internal} />
              </section>
            )}
          </div>
        </div>
      )}

      {tab === 'inspections' && (
        <div className="space-y-6">
          {access.canManage && (hasLiveVisit ? (
            <details className="panel">
              <summary className="panel-head cursor-pointer list-none"><h2>Plan another visit</h2><span className="text-sm text-muted">Follow-up or extra site</span></summary>
              <div className="panel-pad">{planForm}</div>
            </details>
          ) : (
            <section className="panel panel-pad">
              <h2 className="text-lg">Plan {profile.activity.toLowerCase()}</h2>
              {planForm}
            </section>
          ))}
          <section className="panel">
            {inspections.length === 0 ? (
              <p className="empty">No inspections yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {inspections.map((i) => (
                  <li key={i.id}>
                    <Link href={`/staff/inspections/${i.id}`} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-ink no-underline hover:bg-paper">
                      <span>
                        <strong className="block">{i.title}</strong>
                        <span className="text-sm text-ink-2">{i.code} · {i.scheduled_for ? fmtVisit(i.scheduled_for, i.arrival_window) : <strong className="text-warn">Date not set</strong>} · {i.agent_name ?? 'no agent'} · {i.finding_count} findings · {i.evidence_count} evidence</span>
                      </span>
                      <InspectionChip status={i.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'evidence' && (
        <section className="panel panel-pad space-y-4">
          <p className="text-ink-2">
            Evidence is added from each inspection. It is released to the client when the inspection is reviewed; items flagged by the integrity
            check (no GPS, far from the site, odd timestamps) stay internal until someone ticks “Visible to client”.
          </p>
          <EvidenceGallery files={evidence} staffControls={(f) => <FileControls f={f} canManage={access.canManage} />} />
        </section>
      )}

      {tab === 'reports' && (
        <div className="space-y-6">
          <section className="panel panel-pad">
            <h2 className="text-lg">Start a report</h2>
            <form action={createReportAction} className="mt-3 grid gap-3 md:grid-cols-[1.5fr_1fr_auto] md:items-end">
              <input type="hidden" name="projectId" value={p.id} />
              <label className="label">Title<input className="input" name="title" defaultValue={`${p.service_name ?? 'Verification'} report`} maxLength={200} /></label>
              <label className="label">
                Based on inspection
                <select className="input" name="inspectionId" defaultValue={inspections.find((i) => i.status === 'reviewed')?.id ?? ''}>
                  <option value="">All reviewed inspections</option>
                  {inspections.filter(i => i.status === 'reviewed').map((i) => <option key={i.id} value={i.id}>{i.code} · {i.title}</option>)}
                </select>
              </label>
              <button className="btn btn-primary" type="submit">Create draft</button>
            </form>
          </section>
          <section className="panel panel-pad space-y-3">
            <h2 className="text-lg">Report PDFs</h2>
            <p className="hint">Optional. Upload the designed PDF here, then attach it in the report. The client gets it when the report is published.</p>
            <Uploader projectId={p.id} category="report" label="Upload PDF" accept="application/pdf" />
            <DocumentList files={reportFiles} />
          </section>
          <section className="panel">
            {reports.length === 0 ? (
              <p className="empty">No reports yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {reports.map((r) => (
                  <li key={r.id}>
                    <Link href={`/staff/projects/${p.code}/reports/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-ink no-underline hover:bg-paper">
                      <span>
                        <strong className="block">{r.title}</strong>
                        <span className="text-sm text-ink-2">
                          by {r.author_name ?? '—'}{r.reviewer_name ? ` · reviewed by ${r.reviewer_name}` : ''} · {fmtDateTime(r.updated_at)}
                          {r.client_rating ? ` · client rating ${r.client_rating}/5` : ''}
                        </span>
                      </span>
                      <ReportChip status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'operations' && <OperationsPanel projectId={p.id} manager={true} finance={user.role === 'admin'} section="billing" />}
      {tab === 'agreement' && <OperationsPanel projectId={p.id} manager={true} finance={user.role === 'admin'} section="agreement" />}
      {tab === 'monitoring' && <OperationsPanel projectId={p.id} manager={true} finance={user.role === 'admin'} section="monitoring" />}
      {tab === 'settings' && <OperationsPanel projectId={p.id} manager={true} finance={user.role === 'admin'} section="settings" />}
      {tab === 'alerts' && <OperationsPanel projectId={p.id} manager={true} finance={user.role === 'admin'} section="alerts" />}

      {tab === 'messages' && (
        <section className="panel panel-pad">
          <Messages messages={messages} viewerId={user.id} action={staffMessageAction} hidden={{ projectId: p.id }} staff />
        </section>
      )}

      {tab === 'activity' && (
        <section className="panel panel-pad">
          <p className="hint mb-4">Every change, upload, download and decision on this project and its request. Entries marked “visible to client” appear in the client&apos;s history.</p>
          <Timeline events={events} staff />
        </section>
      )}
    </div>
  )
}
