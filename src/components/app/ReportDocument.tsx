import type { FileRow } from '@/lib/data/files'
import type { FindingRow } from '@/lib/data/inspections'
import type { ProjectView } from '@/lib/data/projects'
import type { ReportRow } from '@/lib/data/reports'
import { confidenceLabels, evidenceGrades, findingStatusLabels, overallStatusLabels } from '@/lib/labels'
import { fmtDate, fmtDateTime } from './format'

// The report as structured data: executive summary, findings with status,
// confidence and evidence grade, the evidence itself, recommendations and
// limitations. Prints cleanly to PDF from the browser.
export default function ReportDocument({ r, project, findings, evidence, tz }: { r: ReportRow; project: ProjectView; findings: FindingRow[]; evidence: FileRow[]; tz?: string }) {
  if (r.snapshot) {
    project = r.snapshot.project
    findings = r.snapshot.findings
    evidence = r.snapshot.evidence
    r = { ...r, ...r.snapshot.report, snapshot: r.snapshot }
  }
  return (
    <article className="report-sheet bg-white">
      <div className="report-sheet__head">
        <span>AngaVeritas · Verification report · {project.code}{r.inspection_code ? ` · ${r.inspection_code}` : ''}</span>
        <span>{r.published_at ? `Published ${fmtDate(r.published_at, tz)}` : 'Draft, not yet published'}</span>
      </div>
      <div className="report-sheet__body space-y-8">
        <header>
          <h1 className="text-[1.9rem]">{r.title}</h1>
          <p className="muted mt-1">
            Prepared for {project.client_name} · {project.title}
            {project.location_label ? ` · ${project.location_label}` : ''}
          </p>
          <div className="verdict mt-5">
            <div className="verdict__section verdict__section--status">
              <span className="verdict__label">Overall status</span>
              <div className="verdict__value">
                {r.overall_status ? <span className={`chip chip--${r.overall_status}`}>{overallStatusLabels[r.overall_status]}</span> : <strong>—</strong>}
              </div>
            </div>
            <div className="verdict__section verdict__section--decision">
              <span className="verdict__label">Recommended decision</span>
              <div className="verdict__value">
                <strong>{r.recommended_decision ?? '—'}</strong>
              </div>
            </div>
          </div>
        </header>

        <section>
          <h2 className="text-xl">Executive summary</h2>
          <p className="prose-text mt-3">{r.executive_summary || '—'}</p>
        </section>
        <section><h2 className="text-xl">Scope of assignment</h2><p className="prose-text mt-3">{r.scope}</p></section>
        <section><h2 className="text-xl">Methodology</h2><p className="prose-text mt-3">{r.methodology}</p></section>

        {findings.length > 0 && (
          <section>
            <h2 className="text-xl">Findings and risk matrix</h2>
            <div className="table-scroll mt-3">
              <table className="table table--wide">
                <thead>
                  <tr><th>Area</th><th className="whitespace-nowrap">Status</th><th>Observation</th><th>Confidence</th><th>Required action</th></tr>
                </thead>
                <tbody>
                  {findings.map((f) => (
                    <tr key={f.id}>
                      <th scope="row">{f.area}</th>
                      <td className="whitespace-nowrap"><span className={`chip chip--${f.status === 'unverified' ? 'none' : f.status}`}>{findingStatusLabels[f.status]}</span></td>
                      <td className="dim">{f.observation}{f.risk_category && <span className="block text-xs">{f.risk_category} · likelihood {f.likelihood ?? '—'}/5 · impact {f.impact ?? '—'}/5</span>}
                        {f.evidence_ids?.length > 0 && <span className="block text-xs">Evidence: {f.evidence_ids.map(id => evidence.find(e => e.id === id)?.evidence_code ?? '—').join(', ')}</span>}</td>
                      <td className="dim">{confidenceLabels[f.confidence]}{f.evidence_grade ? <span className="block font-mono text-xs">{f.evidence_grade}</span> : null}</td>
                      <td className="dim">{f.action ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint mt-2">Evidence grades: {evidenceGrades.map(([c, n]) => `${c} ${n}`).join(' · ')}.</p>
          </section>
        )}

        {r.recommendations && (
          <section>
            <h2 className="text-xl">Recommendations</h2>
            <p className="prose-text mt-3">{r.recommendations}</p>
          </section>
        )}

        {evidence.length > 0 && (
          <section>
            <h2 className="text-xl">Photo and GPS evidence</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {evidence.filter((e) => e.media_type === 'photo' || e.media_type === 'drone').map((e) => (
                <figure key={e.id} className="evidence-photo m-0">
                  <img src={`/api/files/${e.id}`} alt={e.caption ?? e.filename} loading="lazy" />
                  <figcaption>
                    <b>{e.evidence_code}</b>
                    <span>
                      {e.caption ?? ''}
                      {e.taken_at ? ` · ${fmtDateTime(e.taken_at, tz)}` : ''}
                      {e.gps_lat != null ? ` · ${e.gps_lat.toFixed(5)}, ${e.gps_lng!.toFixed(5)}` : ''}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
            {evidence.some((e) => e.media_type === 'video') && <p className="hint mt-2">Video evidence is in the project&apos;s evidence archive.</p>}
          </section>
        )}

        <section>
          <h2 className="text-xl">Limitations</h2>
          <p className="prose-text mt-3">{r.limitations}</p>
        </section>

        <p className="text-sm text-muted">
          Prepared by {r.author_name ?? 'AngaVeritas'}{r.reviewer_name ? `, reviewed by ${r.reviewer_name}` : ''}. Confidential to {project.client_name}.
        </p>
      </div>
    </article>
  )
}
