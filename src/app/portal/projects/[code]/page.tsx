import OperationsPanel from '@/components/app/OperationsPanel'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ConfidenceTag, FindingChip, HealthChip, InspectionChip, ReportChip, StageChip, StageTracker, Tabs, Timeline } from '@/components/app/bits'
import EvidenceGallery, { DocumentList } from '@/components/app/EvidenceGallery'
import { fmtDate, kes, relativeDays } from '@/components/app/format'
import Messages from '@/components/app/Messages'
import Uploader from '@/components/app/Uploader'
import VisitReadiness from '@/components/app/VisitReadiness'
import { requireClient } from '@/lib/auth/session'
import { listProjectFiles } from '@/lib/data/files'
import { listInspections, listProjectFindings } from '@/lib/data/inspections'
import { listMessages, markRead } from '@/lib/data/messages'
import { projectBalanceDue, projectDepositDue, reportLock } from '@/lib/data/operations'
import CompleteProjectCard from '@/components/app/CompleteProjectCard'
import { listContacts, projectByCodeFor, projectEvents } from '@/lib/data/projects'
import { listReports } from '@/lib/data/reports'
import { overallStatusLabels, paymentStatusLabels } from '@/lib/labels'
import { site } from '@/lib/site'
import { clientNextStep } from '@/lib/workflow'
import { addContactAction, clientMessageAction, removeContactAction } from '../../actions'
import OnboardingForm from './OnboardingForm'

export const metadata = { title: 'Project' }

// History has no tab of its own; it opens from Recent activity. Older links to the evidence and
// documents tabs open the tab that now holds that content.
const TABS = ['overview', 'onboarding', 'inspections', 'reports', 'messages', 'operations', 'history', 'files', 'agreement', 'settings', 'monitoring'] as const
type Tab = (typeof TABS)[number]
const moved: Record<string, Tab> = { evidence: 'files', documents: 'files', inspections: 'reports' }

export default async function ProjectPage({ params: paramsPromise, searchParams: searchParamsPromise }: { params: Promise<{ code: string }>; searchParams: Promise<{ tab?: string; accepted?: string; onboarded?: string; error?: string; saved?: string }> }) {
  const params = await paramsPromise
  const searchParams = await searchParamsPromise
  const user = await requireClient()
  const access = await projectByCodeFor(user, params.code)
  if (!access) notFound()
  const p = access.project
  const wanted = moved[searchParams.tab ?? ''] ?? searchParams.tab ?? ''
  const tab: Tab = (TABS as readonly string[]).includes(wanted) ? (wanted as Tab) : 'overview'

  const [inspections, findings, reports, evidence, documents, contacts, messages, events, deposit, balance, lock] = await Promise.all([
    listInspections(p.id),
    listProjectFindings(p.id, true),
    listReports(p.id, true),
    listProjectFiles(p.id, { clientView: true, category: 'evidence' }),
    listProjectFiles(p.id, { clientView: true, category: 'client_document' }),
    listContacts(p.id),
    listMessages({ projectId: p.id }, false),
    projectEvents(p.id, true, p.request_id),
    projectDepositDue(p.id),
    projectBalanceDue(p.id),
    reportLock(p.id),
  ])
  if (tab === 'messages') await markRead({ projectId: p.id }, user.id)
  const visibleInspections = inspections.filter((i) => i.status !== 'cancelled')
  const tz = user.timezone
  const href = (t: Tab) => `/portal/projects/${p.code}?tab=${t}`
  const next = clientNextStep(p, inspections, reports, deposit ? { amount: kes(deposit.due_kes), invoice: deposit.code, paymentNotified:deposit.payment_notified } : null, (d) => fmtDate(d, tz), balance ? { amount: kes(balance.total), invoice: balance.codes } : null, lock ? { amount: kes(lock.owedKes), invoice: lock.codes } : null)

  return (
    <div className="space-y-6">
      {searchParams.error && <p role="alert" className="alert alert-bad">{searchParams.error}</p>}
      {searchParams.saved && <p role="status" className="alert alert-ok">{tab === 'operations' ? 'Saved. Payment notifications remain pending until the team confirms the funds.' : 'Saved.'}</p>}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
        <Link href="/portal/projects" className="text-slate-500 hover:text-slate-800 transition-colors">Projects</Link>
        <span>/</span>
        <span className="font-mono text-slate-900">{p.code}</span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-brand-text bg-brand-soft px-2 py-0.5 rounded border border-[#ead9b0]">{p.code}</span>
            {p.service_name && <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{p.service_name}</span>}
            {p.engagement === 'retainer' && <span className="text-xs font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">Retainer</span>}
          </div>
          <h1 className="app-title mt-1.5">{p.title}</h1>
          {p.location_label && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
              <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
              <span>{p.location_label}{p.county ? `, ${p.county}` : ''}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HealthChip health={p.health} />
          <StageChip stage={p.stage} client />
        </div>
      </div>

      {searchParams.accepted && <p className="alert alert-ok"><strong>Thank you, the proposal is accepted.</strong> Next, tell us about the site below so we can plan the visit.</p>}
      {searchParams.onboarded && <p className="alert alert-ok"><strong>Thank you, we have your site details.</strong> Your analyst is now planning the visit.</p>}

      <section className="panel panel-pad space-y-4" aria-label="Progress">
        <StageTracker stage={p.stage} retainer={p.engagement === 'retainer'} client />
        {tab === 'overview' && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-0 border-t border-solid border-line pt-4">
            <div>
              <p className="next-step__label">What happens next</p>
              <p className="next-step__title">{next.title}</p>
              <p className="next-step__text">{next.text}</p>
            </div>
            {next.action && next.action.href !== href(tab) && <Link className="btn btn-primary btn-small" href={next.action.href}>{next.action.label}</Link>}
          </div>
        )}
      </section>

      <Tabs
        className="client-project-tabs"
        active={tab === 'agreement' || tab === 'monitoring' || tab === 'settings' ? '' : tab}
        tabs={[
          { key: 'overview', label: 'Summary', href: href('overview') },
          { key: 'onboarding', label: 'Site details', href: href('onboarding') },
          { key: 'reports', label: 'Findings & reports', href: href('reports'), count: reports.length || undefined },
          { key: 'files', label: 'Files', href: href('files'), count: (evidence.length + documents.length) || undefined },
          { key: 'operations', label: 'Payments', href: href('operations'), count: (deposit && !deposit.payment_notified) || (!deposit && balance) ? 1 : undefined },
          { key: 'messages', label: 'Messages', href: href('messages') },
        ]}
      />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {p.nda_status !== 'none' && (
          <Link href={href('agreement')} className={tab === 'agreement' ? 'font-semibold text-ink underline' : 'text-muted hover:text-ink'}>
            Confidentiality agreement{p.nda_status === 'prepared' ? ' (action needed)' : ''}
          </Link>
        )}
        {p.engagement === 'retainer' && (
          <Link href={href('monitoring')} className={tab === 'monitoring' ? 'font-semibold text-ink underline' : 'text-muted hover:text-ink'}>
            Monitoring plan
          </Link>
        )}
        <Link href={href('settings')} className={tab === 'settings' ? 'font-semibold text-ink underline' : 'text-muted hover:text-ink'}>
          Project settings & privacy
        </Link>
      </div>

      {tab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
          <div className="space-y-6">
            {!['delivered','monitoring','closed'].includes(p.stage) && <VisitReadiness project={p} />}
            {reports[0] && lock && (
              <section className="panel panel-pad">
                <p className="kicker">Latest report · {fmtDate(reports[0].published_at, tz)}</p>
                <h2 className="mt-1 text-lg">{reports[0].title}</h2>
                <p className="mt-3 text-ink-2">Opens once the remaining balance of {kes(lock.owedKes)} is paid.</p>
                <Link className="btn btn-primary btn-small mt-4" href={href('operations')}>How to pay</Link>
              </section>
            )}
            {reports[0] && !lock && (
              <section className="panel panel-pad">
                <p className="kicker">Latest report · {fmtDate(reports[0].published_at, tz)}</p>
                <h2 className="mt-1 text-lg">{reports[0].title}</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {reports[0].overall_status && <span className={`chip chip--${reports[0].overall_status}`}>{overallStatusLabels[reports[0].overall_status]}</span>}
                  {reports[0].recommended_decision && <span className="chip chip--plain chip--none">Recommendation: {reports[0].recommended_decision}</span>}
                </div>
                <p className="prose-text mt-3 line-clamp-4">{reports[0].executive_summary}</p>
                <Link className="btn btn-primary btn-small mt-4" href={`/portal/projects/${p.code}/reports/${reports[0].id}`}>Read the report</Link>
              </section>
            )}
            <CompleteProjectCard projectId={p.id} stage={p.stage} lock={lock} openVisit={inspections.some((i) => ['scheduled', 'in_progress', 'submitted'].includes(i.status))} />
            <section className="panel panel-pad">
              <h2 className="text-lg">At a glance</h2>
              <dl className="kv mt-3">
                <dt>Project health</dt>
                <dd><HealthChip health={p.health} />{p.health_note ? <span className="mt-1 block text-ink-2">{p.health_note}</span> : null}</dd>
                <dt>Next site visit</dt>
                <dd>{p.next_inspection ? `${fmtDate(p.next_inspection, tz)} (${relativeDays(p.next_inspection)})` : 'Not booked yet'}</dd>
                <dt>Your analyst</dt>
                <dd>{p.analyst_name ?? 'Being assigned'}</dd>
                {reports[0] ? (
                  <><dt>Report</dt><dd>Delivered {fmtDate(reports[0].published_at, tz)}</dd></>
                ) : (
                  <><dt>Report expected</dt><dd>{p.due_date ? fmtDate(p.due_date, tz) : 'Confirmed once the visit is booked'}</dd></>
                )}
                <dt>Fee</dt>
                <dd>{kes(p.contract_value_kes)} · <Link href={href('operations')}>{paymentStatusLabels[p.payment_status]}</Link></dd>
              </dl>
            </section>
            {findings.length > 0 && (
              <section className="panel">
                <div className="panel-head"><h2>Key findings</h2><Link href={href('inspections')} className="text-sm">All site visits</Link></div>
                <FindingsTable findings={findings.slice(0, 6)} />
              </section>
            )}
          </div>
          <div className="space-y-6">
            <section className="panel panel-pad space-y-3">
              <h2 className="text-lg">Need something?</h2>
              <Link className="btn btn-secondary w-full" href={href('messages')}>Message your analyst</Link>
              {['delivered', 'monitoring'].includes(p.stage) && (
                <Link className="btn btn-secondary w-full" href={`/estimate?project=${p.code}`}>Request a follow-up visit</Link>
              )}
              {p.stage === 'onboarding' && (!p.onboarding_submitted_at || !p.data_consent_at) && (
                <Link className="btn btn-primary w-full" href={href('onboarding')}>Provide site details</Link>
              )}
              {deposit && !deposit.payment_notified && (
                <Link className="btn btn-secondary w-full" href={href('operations')}>Pay deposit ({kes(deposit.due_kes)})</Link>
              )}
              {site.bookingUrl && <a className="btn btn-secondary w-full" href={site.bookingUrl} target="_blank" rel="noopener">Book a walkthrough call</a>}
            </section>
            <section className="panel">
              <div className="panel-head"><h2>Recent activity</h2>{events.length > 8 && <Link href={href('history')} className="text-sm">See all</Link>}</div>
              <div className="panel-pad"><Timeline events={events.slice(0, 8)} tz={tz} /></div>
            </section>
          </div>
        </div>
      )}

      {tab === 'onboarding' && (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
          <section className="panel panel-pad space-y-4">
            <div>
              <h2 className="text-lg">About the site</h2>
              <p className="hint">
                {p.onboarding_submitted_at
                  ? `Sent ${fmtDate(p.onboarding_submitted_at, tz)}. You can still update these details.`
                  : 'Tell us what we need to plan the visit. Save as you go, then press “Send site details” when you are done.'}
              </p>
            </div>
            <OnboardingForm
              submitted={!!p.onboarding_submitted_at && !!p.data_consent_at}
              v={{
                projectId: p.id,
                title: p.title,
                locationLabel: p.location_label,
                county: p.county,
                siteDirections: p.site_directions,
                siteAccessNotes: p.site_access_notes,
                claims: p.claims,
                concerns: p.concerns,
                investmentValue: p.investment_value_kes,
              }}
            />
          </section>
          <div className="space-y-6">
            <section className="panel panel-pad space-y-4">
              <div>
                <h2 className="text-lg">People at the site</h2>
                <p className="hint">Sellers, contractors, caretakers or suppliers we may need to meet.</p>
              </div>
              {contacts.length > 0 && (
                <ul className="divide-y divide-line">
                  {contacts.map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                      <span>
                        <strong>{c.name}</strong>{c.role ? ` · ${c.role}` : ''}
                        <span className="block text-ink-2">{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
                        {c.notes && <span className="block text-muted">{c.notes}</span>}
                        {!c.may_contact && <span className="block text-warn">Do not contact without asking you first</span>}
                      </span>
                      <form action={removeContactAction}>
                        <input type="hidden" name="projectId" value={p.id} />
                        <input type="hidden" name="contactId" value={c.id} />
                        <button className="linkish text-muted" type="submit">Remove</button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
              <details>
                <summary className="cursor-pointer text-sm font-semibold">Add a person</summary>
                <form action={addContactAction} className="mt-3 space-y-3">
                  <input type="hidden" name="projectId" value={p.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="label">Name<input className="input" name="name" required maxLength={120} /></label>
                    <label className="label">Role<input className="input" name="role" maxLength={120} placeholder="e.g. Contractor" /></label>
                    <label className="label">Phone<input className="input" name="phone" type="tel" maxLength={40} /></label>
                    <label className="label">Email<input className="input" name="email" type="email" maxLength={160} /></label>
                  </div>
                  <label className="label">Notes <span className="opt">(optional)</span><input className="input" name="notes" maxLength={1000} /></label>
                  <label className="check"><input type="checkbox" name="mayContact" defaultChecked /> AngaVeritas may contact this person directly</label>
                  <button className="btn btn-secondary btn-small" type="submit">Add person</button>
                </form>
              </details>
            </section>
            <section className="panel panel-pad space-y-3">
              <h2 className="text-lg">Documents</h2>
              <p className="hint">Title deeds, sale agreements, contracts, plans, quotes, licences: anything we should check.</p>
              <Link className="btn btn-secondary btn-small" href={href('files')}>Add or view documents in Files</Link>
              <DocumentList files={documents} tz={tz} clientView />
            </section>
          </div>
        </div>
      )}

      {(tab === 'inspections' || tab === 'reports') && (
        <div className="space-y-6">
          {visibleInspections.length === 0 && <p className="panel empty">No visit booked yet. Your analyst books it once your site details and deposit are in.</p>}
          {visibleInspections.map((i) => {
            const rows = findings.filter((f) => f.inspection_code === i.code)
            return (
              <section key={i.id} className="panel">
                <div className="panel-head">
                  <div>
                    <p className="kicker">{i.code}</p>
                    <h2 className="mt-0.5">{i.title}</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
                    {i.scheduled_for && <span>{fmtDate(i.scheduled_for, tz)}</span>}
                    <InspectionChip status={i.status} />
                  </div>
                </div>
                {i.status === 'reviewed' ? (
                  rows.length ? <FindingsTable findings={rows} /> : <p className="empty">The findings are in the report.</p>
                ) : (
                  <p className="panel-pad text-ink-2">
                    {i.status === 'scheduled' && `Booked${i.scheduled_for ? ` for ${fmtDate(i.scheduled_for, tz)}` : ''}. Our field agent will collect photos, video and GPS evidence.`}
                    {i.status === 'in_progress' && 'Our field agent is at the site or sending in the evidence.'}
                    {i.status === 'submitted' && 'The visit is done. A second person is checking the evidence before it reaches you.'}
                  </p>
                )}
              </section>
            )
          })}
          <section className="panel panel-pad space-y-3">
            <h2 className="text-lg">Photos and video</h2>
            <p className="text-ink-2">Each item shows its evidence ID, when it was taken and where. Photos appear here once a visit has been checked.</p>
            <EvidenceGallery files={evidence} tz={tz} />
          </section>
        </div>
      )}

      {tab === 'reports' && (
        <section className="panel">
          {lock && reports.length > 0 && <p className="alert alert-warn m-4">Your reports open once the remaining balance of {kes(lock.owedKes)} is paid. <Link href={href('operations')}>How to pay</Link></p>}
          {reports.length === 0 ? (
            <p className="empty">Your report will appear here as soon as it has passed review.</p>
          ) : (
            <ul className="divide-y divide-line">
              {reports.map((r) => (
                <li key={r.id}>
                  <Link href={`/portal/projects/${p.code}/reports/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-ink no-underline hover:bg-paper">
                    <span>
                      <strong className="block">{r.title}</strong>
                      <span className="text-sm text-ink-2">Published {fmtDate(r.published_at, tz)}{!lock && r.recommended_decision ? ` · ${r.recommended_decision}` : ''}</span>
                    </span>
                    <span className="flex gap-2">
                      {!lock && r.overall_status && <span className={`chip chip--${r.overall_status}`}>{overallStatusLabels[r.overall_status]}</span>}
                      <ReportChip status={r.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'files' && <div className="space-y-6">
        <section className="panel panel-pad space-y-3"><h2 className="text-lg">Your documents</h2><p className="hint">Add plans, agreements or other documents the team should check.</p><Uploader projectId={p.id} category="client_document" label="Upload documents" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.csv,.txt" /><DocumentList files={documents} tz={tz} clientView /></section>
        <section className="panel panel-pad space-y-3"><h2 className="text-lg">Reviewed photos and video</h2><EvidenceGallery files={evidence} tz={tz} /></section>
      </div>}
      {tab === 'operations' && !deposit && balance && <p className="alert alert-warn">Balance to pay: <strong>{kes(balance.total)}</strong> on {balance.codes}. Pay it the same way as the deposit, then send us the transaction reference below.</p>}
      {tab === 'operations' && <OperationsPanel projectId={p.id} manager={false} section="billing" />}
      {tab === 'agreement' && <OperationsPanel projectId={p.id} manager={false} section="agreement" />}
      {tab === 'monitoring' && <OperationsPanel projectId={p.id} manager={false} section="monitoring" />}
      {tab === 'settings' && <OperationsPanel projectId={p.id} manager={false} section="settings" />}

      {tab === 'messages' && (
        <section className="panel panel-pad">
          <Messages messages={messages} viewerId={user.id} tz={tz} action={clientMessageAction} hidden={{ projectId: p.id }} />
        </section>
      )}

      {tab === 'history' && (
        <section className="panel panel-pad space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg">Everything so far</h2>
            <Link href={href('overview')} className="text-sm">Back to overview</Link>
          </div>
          <Timeline events={events} tz={tz} />
        </section>
      )}
    </div>
  )
}

function FindingsTable({ findings }: { findings: { id: string; area: string; observation: string; status: 'ok' | 'warn' | 'bad' | 'unverified'; confidence: 'high' | 'moderate' | 'limited'; evidence_grade: string | null; action: string | null }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table table--wide">
        <thead><tr><th>Area</th><th className="whitespace-nowrap">Status</th><th>What we found</th><th>Action needed</th></tr></thead>
        <tbody>
          {findings.map((f) => (
            <tr key={f.id}>
              <th scope="row">{f.area}</th>
              <td className="space-y-1 whitespace-nowrap"><FindingChip status={f.status} /><details className="mt-2 text-sm whitespace-normal"><summary className="cursor-pointer text-muted">Source & confidence</summary><ConfidenceTag c={f.confidence} />{f.evidence_grade && <span className="block font-mono text-xs text-muted">Evidence grade {f.evidence_grade}</span>}</details></td>
              <td className="dim">{f.observation}</td>
              <td className="dim">{f.action ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
