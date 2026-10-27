import { Chip } from '@/components/site/ui'

// Confidence ratings and evidence hierarchy, from the deliverables logic and
// the sample feasibility report.

export const evidenceLevels = [
  { code: 'E1', name: 'Direct observation', example: 'GPS-tagged, time-stamped photo or measurement by our team', confidence: 'High' },
  { code: 'E2', name: 'Independent confirmation', example: 'A buyer or supplier confirms directly to us, not through the client', confidence: 'High, within scope' },
  { code: 'E3', name: 'Original documents', example: 'Title, licence, signed contract, bank statement or invoice', confidence: 'Medium–High, once checked' },
  { code: 'E4', name: 'Corroborated interview', example: 'What someone told us, backed by another source', confidence: 'Medium' },
  { code: 'E5', name: 'Client statement only', example: 'A claim in a proposal or interview we could not check', confidence: 'Low until corroborated' },
]

const confidenceExamples = [
  ['Company operates from stated premises', 'ok', 'High'],
  ['Equipment ownership confirmed', 'ok', 'High'],
  ['Annual turnover estimate', 'warn', 'Moderate'],
  ['Future production capacity', 'bad', 'Limited'],
]

export function ConfidenceTable() {
  return (
    <div className="table-scroll">
      <table className="table">
        <caption className="sr-only">Example findings with confidence ratings</caption>
        <thead><tr><th scope="col">Finding</th><th scope="col">Confidence</th></tr></thead>
        <tbody>
          {confidenceExamples.map(([f, s, l]) => (
            <tr key={f}><td>{f}</td><td><Chip status={s}>{l}</Chip></td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function EvidenceScale() {
  return (
    <ol className="scale">
      {evidenceLevels.map((e) => (
        <li key={e.code}>
          <span className="code">{e.code}</span>
          <strong>{e.name}</strong>
          <span className="conf">{e.confidence}</span>
          <span className="ex">{e.example}</span>
        </li>
      ))}
    </ol>
  )
}

export const statuses = [
  ['ok', 'Evidence shows the project matches what was presented. No material concern at the time of review.'],
  ['warn', 'Still viable, but a gap or inconsistency could affect the outcome. Closer monitoring or more evidence is needed.'],
  ['bad', 'A serious inconsistency, compliance issue or sign of fraud. Act before committing more money.'],
]
