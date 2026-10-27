import { Chip } from '@/components/site/ui'

// One finding from the illustrative pig-farm case study, traced from question to decision.
// Uses only content that appears in the sample report.
export default function SampleFinding() {
  return (
    <figure className="finding">
      <div className="finding__head">
        <span>Sample report · Nakuru County</span>
        <span>Evidence AV-NAK-P03</span>
      </div>
      <div className="finding__body">
        <img src="/images/field/field-access-road.webp" alt="All-weather access road leading to the proposed farm site" width="960" height="630" loading="lazy" />
        <ol className="finding__trail">
          <li>
            <span className="finding__step">Question</span>
            <p>Can livestock trucks reach the farm in the rainy season?</p>
          </li>
          <li>
            <span className="finding__step">Finding</span>
            <p><Chip status="ok" /> Access considered adequate. An all-weather road reaches the site.</p>
          </li>
          <li>
            <span className="finding__step">Recommendation</span>
            <p>Verify access again during the rainy season.</p>
          </li>
          <li>
            <span className="finding__step">Decision it supports</span>
            <p><strong>Conditional proceed.</strong> Access is not a blocker; feed cost and transport terms must be resolved first.</p>
          </li>
        </ol>
      </div>
      <figcaption className="finding__foot">
        Fictional case study, created to show our format and method. It is not evidence of an actual inspection.
      </figcaption>
    </figure>
  )
}
