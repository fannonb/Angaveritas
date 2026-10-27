import type { Metadata } from 'next'
import { CtaBox, DownloadReport } from '@/components/site/ui'
import ReportExcerpt from '@/components/site/ReportExcerpt'
import SampleFinding from '@/components/site/SampleFinding'
import { site } from '@/lib/site'

const pages = [
  ['report-p01', 'p.1 Cover'],
  ['report-p03', 'p.3 Executive summary'],
  ['report-p07', 'p.7 Ground verification'],
  ['report-p11', 'p.11 Risk matrix'],
]

const contents = [
  ['Executive summary', 'Status of each area and the recommended decision.'],
  ['Scope and method', 'What we were asked to test, how, and the evidence used.'],
  ['Ground verification', 'Item-by-item site findings with a status for each.'],
  ['Photo and GPS evidence', 'Every image has an ID and answers a specific question.'],
  ['Feasibility', 'Technical, market and input assessment.'],
  ['Risk matrix', 'Each risk rated, with the action required.'],
  ['Recommendations', 'Prioritised steps before money is committed.'],
  ['Limitations', 'What was and was not verified.'],
]

export const metadata: Metadata = {
  title: "Sample report",
  description: "Download a full 16-page sample verification and feasibility report and see exactly what you receive: findings, photos, GPS evidence, risk matrix and a recommended decision.",
}

export default function SampleReport() {
  return (
    <main>
      <header className="page-head">
        <div className="wrap">
          <h1>Sample report</h1>
          <p className="lead">
            A full 16-page example: a proposed pig farm in Nakuru County, assessed for an investor.
            It shows exactly what you would receive.
          </p>
          <div className="actions"><DownloadReport /></div>
          <p className="note">This is a fictional case study, created to show our format and method. It is not evidence of an actual inspection and does not describe a real client.</p>
        </div>
      </header>

      <section className="section section--snug">
        <div className="wrap grid-2">
          <div>
            <h2>How to read a finding</h2>
            <p className="lead mt-sm">Every finding in the report follows the same path, so you can see why we reached a conclusion.</p>
            <ol className="checklist checklist--plain mt-md">
              <li><strong>Question.</strong> What you need to know before you commit money.</li>
              <li><strong>Finding and evidence.</strong> What we found, with a status and the photo or record behind it.</li>
              <li><strong>Recommendation.</strong> What to do next to close any gap.</li>
              <li><strong>Decision.</strong> How the findings add up to a recommended decision.</li>
            </ol>
          </div>
          <SampleFinding />
        </div>
      </section>

      <section className="section section--grey">
        <div className="wrap">
          <div className="section-intro">
            <h2>Page previews</h2>
            <p>Select a page to open the full PDF.</p>
          </div>
          <div className="report-pages report-pages--4">
            {pages.map(([f, label]) => (
              <a key={f} href={site.sampleReportPdf} target="_blank" rel="noopener">
<img src={`/images/field/${f}.webp`} alt={`Sample report ${label}`} width="935" height="1210" loading="lazy" />
                <span className="page-label">{label}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap grid-2 grid-2--top">
          <div>
            <h2>What's inside</h2>
            <p className="lead mt-sm">Every report follows the same structure, so you always know where to look.</p>
          </div>
          <dl className="def-list">
            {contents.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}
          </dl>
        </div>
      </section>

      <section className="section section--grey">
        <div className="wrap">
          <div className="section-intro">
            <h2>From the report: the risk matrix</h2>
            <p>Each risk gets a status and a specific action, ending in a clear recommended decision.</p>
          </div>
          <ReportExcerpt />
        </div>
      </section>

      <CtaBox title="Want a report like this for your project?" />
    </main>
  )
}
