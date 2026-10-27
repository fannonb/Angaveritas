import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ConfidenceTag, FindingChip, InspectionChip } from '@/components/app/bits'
import EvidenceGallery from '@/components/app/EvidenceGallery'
import FieldNotes from '@/components/app/FieldNotes'
import GuidedFindingForm from '@/components/app/FindingForm'
import VisitSubmit from '@/components/app/VisitSubmit'
import { fmtDate, fmtDateTime } from '@/components/app/format'
import Uploader from '@/components/app/Uploader'
import { requireStaff } from '@/lib/auth/session'
import { listProjectFiles } from '@/lib/data/files'
import { getInspection, listFindings, listInspectionChecks, listInspectionCorrections } from '@/lib/data/inspections'
import { listContacts, projectFor } from '@/lib/data/projects'
import { listAssignableStaff } from '@/lib/data/users'
import { site } from '@/lib/site'
import { fieldCollectionProblem } from '@/lib/workflow'
import { deleteFindingAction, inspectionStatusAction, updateInspectionPlanAction, saveInspectionCheckAction, requestInspectionCorrectionAction, resolveInspectionCorrectionAction } from '../../actions'
import FileControls from '../../FileControls'

export const metadata = { title: 'Inspection' }

const suggestedAreas = ['Physical existence', 'Location matches GPS', 'Site access', 'Operations running', 'Progress vs. plan', 'Workforce on site', 'Materials and equipment', 'Quality issues', 'Neighbours and surroundings', 'Documents seen', 'Regulatory compliance']

export default async function InspectionPage({ params: paramsPromise, searchParams: searchParamsPromise }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const params = await paramsPromise
  const searchParams = await searchParamsPromise
  const user = await requireStaff()
  const insp = await getInspection(params.id)
  if (!insp) notFound()
  const access = await projectFor(user, insp.project_id)
  if (!access?.canFieldwork) notFound()
  if (user.role === 'field_agent' && insp.agent_id !== user.id && !(insp.agent_id === null && access.project.field_agent_id === user.id)) notFound()
  const p = access.project
  const [findings, evidence, contacts, staff, checks, corrections] = await Promise.all([
    listFindings(insp.id),
    listProjectFiles(p.id, { clientView: false, category: 'evidence', inspectionId: insp.id }),
    listContacts(p.id),
    access.canManage ? listAssignableStaff() : [],
    listInspectionChecks(insp.id),
    listInspectionCorrections(insp.id),
  ])
  const open = ['scheduled', 'in_progress'].includes(insp.status)
  const collectionProblem = fieldCollectionProblem(p, insp)
  const locked = !!collectionProblem
  // Checklist lines double as suggestions for what was checked.
  const checklistLines = (insp.objectives ?? '').split('\n').map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter((l) => l && !l.endsWith(':'))
  const areas = [...new Set([...checklistLines, ...suggestedAreas])]
  const required = checks.filter(c => c.required)
  const completed = required.filter(c => c.outcome !== 'pending').length
  const pendingCorrections = corrections.filter(c => !c.resolved_at)
  const released = evidence.filter(e => e.visible_to_client).length

  return (
    <div className="space-y-5">
      {searchParams.error && <p role="alert" className="alert alert-bad">{searchParams.error}</p>}
      <p className="text-sm"><Link href={`/staff/projects/${p.code}?tab=inspections`}>← {p.code} · {p.title}</Link></p>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="kicker">{insp.code} · {insp.scheduled_for ? fmtDate(insp.scheduled_for) : 'date to be confirmed'} · {insp.agent_name ?? 'no agent yet'}</p>
          <h1 className="app-title mt-1">{insp.title}</h1>
          <p className="mt-1 text-ink-2">{p.location_label ?? 'Location to be confirmed'}{p.county ? `, ${p.county}` : ''}</p>
        </div>
        <InspectionChip status={insp.status} />
      </div>

      <section className="next-step" aria-label="What to do now">
        <div>
          <p className="next-step__label">What to do now</p>
          {insp.status === 'scheduled' && <><p className="next-step__title">{insp.scheduled_for ? `Visit on ${fmtDate(insp.scheduled_for)}` : 'Visit date to be confirmed'}</p><p className="next-step__text">Press Start when you arrive. Then add photos and what you found, and send the visit for review at the end.</p></>}
          {insp.status === 'in_progress' && <><p className="next-step__title">Visit in progress</p><p className="next-step__text">Add photos and what you found below. When you are done, send it for review at the bottom of the page.{insp.started_at ? ` Started ${fmtDateTime(insp.started_at)}.` : ''}</p></>}
          {insp.status === 'submitted' && <><p className="next-step__title">Sent for review{insp.submitted_at ? ` ${fmtDateTime(insp.submitted_at)}` : ''}</p><p className="next-step__text">{access.canManage ? (insp.agent_id === user.id && user.role !== 'admin' ? 'Someone other than the field agent must review this visit.' : 'Check the findings and photos, then release them to the client or reopen the visit.') : 'A reviewer is checking it. It is locked unless they reopen it.'}</p></>}
          {insp.status === 'reviewed' && <><p className="next-step__title">Reviewed</p><p className="next-step__text">Checked{insp.reviewed_at ? ` ${fmtDateTime(insp.reviewed_at)}` : ''}{insp.reviewed_by_name ? ` by ${insp.reviewed_by_name}` : ''}. Findings and {released} evidence items released. {evidence.length - released} evidence items remain held for review.</p></>}
          {insp.status === 'cancelled' && <><p className="next-step__title">Cancelled</p><p className="next-step__text">This visit will not go ahead.</p></>}
        </div>
        <div className="flex flex-wrap gap-2">
          {insp.status === 'scheduled' && !locked && <StatusButton id={insp.id} to="in_progress" label="Start the visit" primary />}
          {access.canManage && insp.status === 'submitted' && (insp.agent_id !== user.id || user.role === 'admin') && <StatusButton id={insp.id} to="reviewed" label="Mark reviewed and release to client" primary />}
          {access.canManage && insp.status === 'cancelled' && <StatusButton id={insp.id} to="scheduled" label="Reopen" />}
          
        </div>
      </section>

      {open && collectionProblem && <p className="alert alert-warn">{access.canManage ? collectionProblem : `This visit cannot start yet. ${collectionProblem} The lead analyst will sort this out.`}</p>}
      {open && (
        <nav className="flex flex-wrap items-center gap-1.5 text-xs text-muted" aria-label="Visit steps">
          <span className="font-semibold text-ink-2 mr-1">Steps:</span>
          <a className="rounded px-2.5 py-1 hover:bg-slate-100 hover:text-ink font-medium" href="#visit-photos">1. Photos & video</a>
          <span className="text-line-strong">·</span>
          <a className="rounded px-2.5 py-1 hover:bg-slate-100 hover:text-ink font-medium" href="#visit-checks">2. Required checks</a>
          <span className="text-line-strong">·</span>
          <a className="rounded px-2.5 py-1 hover:bg-slate-100 hover:text-ink font-medium" href="#visit-findings">3. Findings</a>
          <span className="text-line-strong">·</span>
          <a className="rounded px-2.5 py-1 hover:bg-slate-100 hover:text-ink font-medium" href="#visit-notes">4. Notes</a>
          <span className="text-line-strong">·</span>
          <a className="rounded px-2.5 py-1 hover:bg-slate-100 hover:text-ink font-medium" href="#finish">5. Submit</a>
        </nav>
      )}

      {access.canManage && ['submitted','reviewed'].includes(insp.status) && <details className="panel panel-pad">
        <summary className="cursor-pointer font-semibold">Request changes and reopen visit</summary>
        <form action={requestInspectionCorrectionAction} className="mt-3 space-y-3">
          <input type="hidden" name="inspectionId" value={insp.id} />
          <p className="hint">The assigned agent will receive the reason and deadline. Submitted work stays locked until this request is saved.</p>
          <label className="label">What needs attention?<select className="input" name="checkId"><option value="">Whole visit</option>{checks.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
          <label className="label">What should the agent change?<textarea className="input" name="reason" required minLength={5} maxLength={4000} /></label>
          <label className="label">Needed by <span className="opt">(optional)</span><input className="input" type="date" name="dueOn" /></label>
          <button className="btn btn-secondary" type="submit">Send changes to agent</button>
        </form>
      </details>}

      {corrections.length > 0 && <section className="panel panel-pad space-y-3" aria-label="Corrections">
        <h2 className="text-lg">Changes requested</h2>
        {corrections.map(c => <article key={c.id} className="rounded border border-line p-3 space-y-2">
          <p className="font-semibold">{c.label ?? 'Whole visit'} · {c.resolved_at ? 'Completed, awaiting review' : 'Action needed'}</p>
          <p className="prose-text">{c.reason}</p><p className="hint">{c.assigned_name} · requested by {c.requested_name}{c.due_on ? ` · due ${fmtDate(c.due_on)}` : ''}</p>
          {c.resolution && <p className="text-sm">What changed: {c.resolution}</p>}
          {!c.resolved_at && !locked && <form action={resolveInspectionCorrectionAction} className="space-y-2">
            <input type="hidden" name="inspectionId" value={insp.id} /><input type="hidden" name="correctionId" value={c.id} />
            <label className="label">What did you change?<textarea className="input" name="resolution" required minLength={5} maxLength={4000} /></label>
            <button className="btn btn-secondary btn-small">Mark correction done</button>
          </form>}
        </article>)}
      </section>}

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr] xl:items-start">
        <div className="space-y-6 xl:col-start-2 xl:row-start-1">
          <section className="panel panel-pad space-y-4" id="visit-brief">
            <h2 className="text-lg">The visit</h2>
            <div>
              <h3 className="text-base">What to check</h3>
              <p className="prose-text mt-1">{insp.objectives ?? 'No checklist yet. Ask the lead analyst what to check.'}</p>
            </div>
            {p.claims && insp.objectives !== `Verify:\n${p.claims}` && <div><h3 className="text-base">What the client was told</h3><p className="prose-text mt-1">{p.claims}</p></div>}
            {p.concerns && <div><h3 className="text-base">What worries the client</h3><p className="prose-text mt-1">{p.concerns}</p></div>}
            <div>
              <h3 className="text-base">Finding the site</h3>
              <p className="prose-text mt-1">{p.site_directions ?? 'No directions yet.'}</p>
              {p.site_access_notes && <p className="prose-text mt-1">{p.site_access_notes}</p>}
              {p.location_lat != null && <p className="mt-2"><a className="btn btn-secondary btn-small" href={`https://www.google.com/maps/dir/?api=1&destination=${p.location_lat},${p.location_lng}`} target="_blank" rel="noopener noreferrer">Directions in Google Maps</a></p>}
            </div>
            {contacts.length > 0 && (
              <div>
                <h3 className="text-base">People to meet</h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {contacts.map((c) => (
                    <li key={c.id}>
                      <strong>{c.name}</strong>{c.role ? ` · ${c.role}` : ''}{c.phone ? <> · <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>{c.phone}</a></> : ''}
                      {!c.may_contact && <span className="block font-semibold text-bad">Do not contact without the client&apos;s OK</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {user.role === 'field_agent' && (
              <div className="rounded border border-line bg-paper p-3 text-sm">
                <p className="font-semibold text-ink">Need assistance at this site?</p>
                <p className="hint mt-0.5">Call or WhatsApp coordinator if access is blocked or site differs from instructions.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {site.phone && (
                    <a className="btn btn-secondary btn-xs" href={`tel:${site.phone.replace(/[^\d+]/g, '')}`}>
                      Call coordinator
                    </a>
                  )}
                  {site.whatsapp && (
                    <a className="btn btn-secondary btn-xs" href={`https://wa.me/${site.whatsapp.replace(/\D/g, '')}?text=Help%20needed%20for%20inspection%20${insp.code}`} target="_blank" rel="noopener">
                      WhatsApp coordinator
                    </a>
                  )}
                </div>
              </div>
            )}
          </section>

          {access.canManage && open && (
            <details className="panel">
              <summary className="panel-head cursor-pointer list-none"><h2>Change the plan</h2><span className="text-sm text-muted">Date, agent, checklist</span></summary>
              <form action={updateInspectionPlanAction} className="panel-pad space-y-3">
                <input type="hidden" name="inspectionId" value={insp.id} />
                <label className="label">Title<input className="input" name="title" defaultValue={insp.title} maxLength={200} /></label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="label">Date<input className="input" type="date" name="scheduledFor" defaultValue={insp.scheduled_for ?? ''} /></label>
                  <label className="label">
                    Field agent
                    <select className="input" name="agentId" defaultValue={insp.agent_id ?? ''}>
                      <option value="">None</option>
                      {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select>
                  </label>
                </div>
                <label className="label">Required checks — one per line<textarea className="input min-h-[8rem]" name="objectives" defaultValue={insp.objectives ?? ''} maxLength={8000} /></label>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <button className="btn btn-secondary btn-small" type="submit">Save plan</button>
                </div>
              </form>
              {access.canManage && open && (
                <div className="border-0 border-t border-line p-3 pt-2">
                  <StatusButton id={insp.id} to="cancelled" label="Cancel this visit" />
                </div>
              )}
            </details>
          )}
        </div>

        <div className="space-y-6 xl:col-start-1 xl:row-start-1">
          {/* Step 1: Photos, videos, and documents */}
          <section className="panel" id="visit-photos">
            <div className="panel-head">
              <h2>Photos and evidence</h2>
              <span className="text-sm text-muted">{evidence.length} added</span>
            </div>
            <div className="panel-pad space-y-4">
              {!locked && (
                <Uploader
                  projectId={p.id}
                  inspectionId={insp.id}
                  category="evidence"
                  label="Take or add photos / documents"
                  accept="image/*,video/*,.pdf"
                  allowDrone
                  hint="Upload photos, videos, drone footage, or documents (ID, stamp, registry, receipts). GPS coordinates are captured automatically when present."
                />
              )}
              <EvidenceGallery files={evidence} staffControls={(f) => access.canManage || !locked ? <FileControls f={f} canManage={access.canManage} /> : null} />
            </div>
          </section>

          {/* Step 2: Required checks */}
          {checks.length > 0 && (
            <section className="panel" aria-label="Required visit checks" id="visit-checks">
              <div className="panel-head">
                <h2>Required checks</h2>
                <span className="text-sm">{completed} of {required.length} recorded</span>
              </div>
              <div className="panel-pad space-y-3">
                <p className="hint">Record each objective from the brief. Marking an item checked automatically records a verified finding with the attached evidence.</p>
                {checks.map(c => (
                  <details key={c.id} className="rounded border border-line p-3" open={c.required && c.outcome === 'pending'}>
                    <summary className="cursor-pointer font-semibold">
                      {c.label} <span className="text-sm font-normal text-muted">· {c.outcome === 'pending' ? 'To do' : c.outcome === 'checked' ? 'Checked' : c.outcome === 'another_visit' ? 'Needs another visit' : 'Could not check'}{!c.required ? ' · no longer required' : ''}</span>
                    </summary>
                    {locked ? (
                      <p className="prose-text mt-2">{c.note || 'No result recorded.'}</p>
                    ) : (
                      <form action={saveInspectionCheckAction} className="mt-3 space-y-3">
                        <input type="hidden" name="inspectionId" value={insp.id} />
                        <input type="hidden" name="checkId" value={c.id} />
                        <label className="label">
                          Outcome
                          <select className="input" name="outcome" defaultValue={c.outcome === 'pending' ? 'checked' : c.outcome}>
                            <option value="checked">Checked (Verified)</option>
                            <option value="could_not_check">Could not check</option>
                            <option value="another_visit">Needs another visit</option>
                            <option value="pending">Still to do</option>
                          </select>
                        </label>
                        <label className="label">
                          Observations / notes
                          <textarea className="input" name="note" defaultValue={c.note || (c.label ? `Confirmed: ${c.label}` : '')} minLength={3} required maxLength={4000} placeholder="Describe what you observed on site" />
                        </label>
                        {evidence.length > 0 && (
                          <fieldset className="space-y-1">
                            <legend className="label">Supporting photos or documents</legend>
                            {evidence.map(e => {
                              const isChecked = c.evidence_ids.length > 0 ? c.evidence_ids.includes(e.id) : true
                              return (
                                <label key={e.id} className="check text-sm">
                                  <input type="checkbox" name="evidenceIds" value={e.id} defaultChecked={isChecked} />
                                  {e.evidence_code} · {e.filename}
                                </label>
                              )
                            })}
                          </fieldset>
                        )}
                        <button className="btn btn-secondary btn-small" type="submit">Save check & record finding</button>
                      </form>
                    )}
                  </details>
                ))}
              </div>
            </section>
          )}

          {/* Step 3: Findings */}
          <section className="panel" id="visit-findings">
            <div className="panel-head">
              <h2>Findings</h2>
              <span className="text-sm text-muted">{findings.length} recorded</span>
            </div>
            <div className="panel-pad space-y-4">
              {findings.length === 0 ? (
                <p className="text-sm text-muted">Findings recorded from completed checks will appear here. You can also add extra findings below.</p>
              ) : (
                <div className="space-y-2">
                  {findings.map((f) => (
                    <details key={f.id} className="rounded border border-line p-3">
                      <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                        <strong>{f.area}</strong>
                        <FindingChip status={f.status} />
                        <ConfidenceTag c={f.confidence} />
                      </summary>
                      <p className="mt-2 whitespace-pre-line text-sm">{f.observation}</p>
                      {f.action && <p className="mt-1 text-sm text-ink-2">Action needed: {f.action}</p>}
                      {!locked && (
                        <div className="mt-3 border-0 border-t border-solid border-line pt-3">
                          <GuidedFindingForm inspectionId={insp.id} f={f} evidence={evidence} />
                          <form action={deleteFindingAction} className="mt-2">
                            <input type="hidden" name="inspectionId" value={insp.id} />
                            <input type="hidden" name="findingId" value={f.id} />
                            <button className="linkish text-sm text-bad" type="submit">Delete finding</button>
                          </form>
                        </div>
                      )}
                    </details>
                  ))}
                </div>
              )}

              {!locked && (
                <details className="rounded border border-dashed border-line p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-ink hover:underline">
                    + Add an additional finding (outside brief)
                  </summary>
                  <div className="mt-3">
                    <GuidedFindingForm key={`new-${findings.length}`} inspectionId={insp.id} evidence={evidence} />
                  </div>
                </details>
              )}
              <datalist id="finding-areas">{areas.map((a) => <option key={a} value={a} />)}</datalist>
            </div>
          </section>

          {/* Step 4: Notes */}
          <div id="visit-notes">
            {locked ? (
              <section className="panel panel-pad">
                <h2 className="text-lg">Notes</h2>
                <p className="prose-text mt-2">{insp.field_notes || 'No notes.'}</p>
              </section>
            ) : (
              <FieldNotes inspectionId={insp.id} userId={user.id} notes={insp.field_notes ?? ''} revision={insp.updated_at.toISOString()} />
            )}
          </div>

          {/* Step 5: Submit visit */}
          {open && !locked && (
            <section className="panel panel-pad space-y-3" aria-labelledby="finish">
              <h2 id="finish" className="text-lg">Finish the visit</h2>
              {required.length > 0 && (
                <p className="text-sm">
                  Required checks: {completed} of {required.length} recorded.
                  {completed < required.length ? ' Finish the remaining checks above.' : ''}
                </p>
              )}
              {pendingCorrections.length > 0 && <p className="text-sm text-warn">{pendingCorrections.length} correction{pendingCorrections.length > 1 ? 's' : ''} still need a response.</p>}
              <p className="text-sm text-muted">
                {findings.length} finding{findings.length === 1 ? '' : 's'} and {evidence.length} evidence file{evidence.length === 1 ? '' : 's'} recorded.
                {evidence.length === 0 ? ' Upload at least one photo or document.' : ''}
              </p>
              <p className="hint">Save your notes first. Once sent, the visit is locked and a reviewer checks it before the client sees anything.</p>
              <VisitSubmit inspectionId={insp.id} incomplete={completed < required.length || pendingCorrections.length > 0 || findings.length === 0 || evidence.length === 0} />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusButton({ id, to, label, primary }: { id: string; to: string; label: string; primary?: boolean }) {
  return (
    <form action={inspectionStatusAction}>
      <input type="hidden" name="inspectionId" value={id} />
      <input type="hidden" name="to" value={to} />
      <button className={`btn btn-small ${primary ? 'btn-primary' : 'btn-secondary'}`} type="submit">{label}</button>
    </form>
  )
}

