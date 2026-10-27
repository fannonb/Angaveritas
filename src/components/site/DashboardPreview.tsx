import { Chip, Icon } from '@/components/site/ui'

// A static picture of the client portal. Every name and figure is made up and labelled as such.
const projects = [
  { title: 'House build, Kitengela', service: 'Project monitoring', status: 'ok', step: 3 },
  { title: 'Plot purchase, Nanyuki', service: 'Ground verification', status: 'warn', step: 5 },
  { title: 'Feed supplier, Eldoret', service: 'Supplier verification', status: 'ok', step: 2 },
]

export default function DashboardPreview() {
  return (
    <figure className="dash-preview" aria-label="Preview of the client dashboard using demonstration data">
      <div className="dash-preview__bar">
        <span className="dash-preview__dots" aria-hidden="true"><i /><i /><i /></span>
        <span>Client portal</span>
        <span className="dash-preview__demo">Demonstration data</span>
      </div>
      <div className="dash-preview__body">
        <div className="dash-preview__stats">
          <div><span>Active projects</span><strong>3</strong></div>
          <div><span>On track</span><strong>2 <small>of 3</small></strong></div>
          <div><span>Reports</span><strong>1</strong></div>
        </div>
        <div className="dash-preview__alert">
          <span className="dash-preview__icon"><Icon name="file" /></span>
          <span><strong>Your report is ready</strong><span>Plot purchase, Nanyuki</span></span>
        </div>
        <ul className="dash-preview__list">
          {projects.map((p) => (
            <li key={p.title}>
              <div className="dash-preview__row">
                <span><strong>{p.title}</strong><span>{p.service}</span></span>
                <Chip status={p.status} />
              </div>
              <div className="dash-preview__meter" aria-hidden="true"><span style={{ width: `${(p.step / 5) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  )
}
