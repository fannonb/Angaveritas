import { Chip } from '@/components/site/ui'

// Risk matrix excerpt from the illustrative pig-farm feasibility case study.
const rows = [
  ['Site access', 'ok', 'Access considered adequate.', 'Verify during rainy season.'],
  ['Target buyer', 'warn', 'Buyer identified, but commercial terms not independently confirmed.', 'Obtain current buyer specifications and terms.'],
  ['Feed cost', 'bad', 'Feed price and conversion efficiency may materially affect margins.', 'Get multiple quotes; model +10%, +20%, +30% feed cost.'],
  ['Water reliability', 'warn', 'Quantity and quality not independently established.', 'Test source, measure yield, confirm backup.'],
  ['Transport', 'bad', 'Collection and delivery arrangements can affect margins and animal welfare.', 'Confirm buyer collection policy or a costed route.'],
  ['Regulatory compliance', 'warn', 'County, environmental and livestock requirements unconfirmed.', 'Complete compliance checklist before construction.'],
]

export default function ReportExcerpt() {
  return (
    <figure className="report-sheet" aria-label="Excerpt from the AngaVeritas sample feasibility report">
      <div className="report-sheet__head">
        <span>Verification &amp; Feasibility Report · Section 7, Risk matrix</span>
        <span>Sample · Nakuru County</span>
      </div>
      <div className="report-sheet__body">
        <h3>Proposed 300-head commercial pig enterprise</h3>
        <p className="muted">Feasibility study, ground verification and investment risk review</p>
        <div className="verdict">
          <div className="verdict__section verdict__section--status">
            <span className="verdict__label">Overall status</span>
            <div className="verdict__value">
              <Chip status="warn" />
            </div>
          </div>
          <div className="verdict__section verdict__section--decision">
            <span className="verdict__label">Recommended decision</span>
            <div className="verdict__value">
              <strong>Conditional proceed</strong>
            </div>
          </div>
        </div>
        <div className="table-scroll">
          <table className="table table--wide">
            <caption className="sr-only">Risk matrix excerpt</caption>
            <thead><tr><th scope="col">Risk area</th><th scope="col" className="whitespace-nowrap">Status</th><th scope="col">Issue</th><th scope="col">Required action</th></tr></thead>
            <tbody>
              {rows.map(([area, s, issue, action]) => (
                <tr key={area}><th scope="row">{area}</th><td className="whitespace-nowrap"><Chip status={s} /></td><td className="dim">{issue}</td><td className="dim">{action}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="report-quote">
          “The concept is potentially viable, but the investment case should not be considered
          investment-ready until key commercial, operational, and financial uncertainties are resolved.”
        </p>
      </div>
      <figcaption className="report-sheet__foot">
        Fictional case study, created to show our format and method. It is not evidence of an actual inspection.
      </figcaption>
    </figure>
  )
}
