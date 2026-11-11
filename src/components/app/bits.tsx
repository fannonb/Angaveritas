import Link from 'next/link'
import type { ProgressStep } from '@/lib/workflow'
import { Chip } from '@/components/site/ui'
import { kenyaOutline, mapPoint } from '@/components/site/ui'
import {
  arrivalWindows,
  clientStageLabels,
  confidenceLabels,
  findingStatusLabels,
  healthChip,
  healthLabels,
  inspectionStatusLabels,
  projectStages,
  reportStatusLabels,
  requestStatusLabels,
  stageLabels,
  type Confidence,
  type FindingStatus,
  type Health,
  type InspectionStatus,
  type ProjectStage,
  type ReportStatus,
  type RequestStatus,
} from '@/lib/labels'
import { fmtDateTime } from './format'

export function HealthChip({ health }: { health: Health }) {
  return <Chip status={healthChip[health]}>{healthLabels[health]}</Chip>
}

const requestChip: Record<RequestStatus, string> = {
  submitted: 'info',
  in_review: 'info',
  proposal_sent: 'warn',
  accepted: 'ok',
  declined: 'none',
  withdrawn: 'none',
  closed: 'none',
}
// What a client sees for each request status: what is happening, not the internal state.
const clientRequestLabels: Partial<Record<RequestStatus, string>> = { submitted: 'Received', in_review: 'Preparing your proposal', proposal_sent: 'Proposal ready' }
export function RequestChip({ status, client }: { status: RequestStatus; client?: boolean }) {
  const label = (client && clientRequestLabels[status]) || requestStatusLabels[status]
  return <Chip status={requestChip[status]}>{label}</Chip>
}

export function StageChip({ stage, client, label }: { stage: ProjectStage; client?: boolean; label?: string }) {
  return <Chip status={stage === 'closed' ? 'none' : stage === 'delivered' ? 'ok' : 'info'}>{label ?? (client ? clientStageLabels : stageLabels)[stage]}</Chip>
}

export function FindingChip({ status }: { status: FindingStatus }) {
  return <Chip status={status === 'unverified' ? 'none' : status}>{findingStatusLabels[status]}</Chip>
}

export function ConfidenceTag({ c }: { c: Confidence }) {
  const color = c === 'high' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : c === 'moderate' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-50 text-slate-700 border-slate-200'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${color}`}>Confidence: {confidenceLabels[c]}</span>
}

export function InspectionChip({ status }: { status: InspectionStatus }) {
  const s = status === 'reviewed' ? 'ok' : status === 'cancelled' ? 'none' : status === 'submitted' ? 'warn' : 'info'
  return <Chip status={s}>{inspectionStatusLabels[status]}</Chip>
}

export function ReportChip({ status }: { status: ReportStatus }) {
  const s = status === 'published' ? 'ok' : status === 'in_review' ? 'warn' : 'none'
  return <Chip status={s}>{reportStatusLabels[status]}</Chip>
}

/** Where the project is in the customer journey. */
export function StageTracker({ stage, retainer, client, labels: overrides }: { stage: ProjectStage; retainer?: boolean; client?: boolean; labels?: Partial<Record<ProjectStage,string>> }) {
  const shown = projectStages.filter((s) => s !== 'closed' && (retainer || s !== 'monitoring'))
  const at = stage === 'closed' ? shown.length : shown.indexOf(stage)
  const labels = { ...(client ? clientStageLabels : stageLabels), ...overrides }
  return (
    <ol className="stages" style={{ ['--n' as string]: shown.length }} aria-label="Project stage">
      {shown.map((s, i) => (
        <li key={s} className={i < at ? 'done' : i === at ? 'now' : undefined} aria-current={i === at ? 'step' : undefined}>
          <span>{labels[s]}</span>
        </li>
      ))}
    </ol>
  )
}

export function Timeline({ events, tz, staff }: { events: { id: number; summary: string; created_at: Date; actor_name: string | null; client_visible?: boolean }[]; tz?: string; staff?: boolean }) {
  if (!events.length) return <p className="empty">Nothing yet.</p>
  return (
    <ul className="timeline">
      {events.map((e) => (
        <li key={e.id}>
          <p className="text-[0.875rem]">{e.summary}</p>
          <p className="text-xs text-muted">
            {fmtDateTime(e.created_at, tz)}
            {e.actor_name ? ` · ${e.actor_name}` : ''}
            {staff && e.client_visible ? ' · visible to client' : ''}
          </p>
        </li>
      ))}
    </ul>
  )
}

const pinColor: Record<Health, string> = { on_track: '#1d7a4b', at_risk: '#e07b1a', high_risk: '#b42318', not_assessed: '#646b75' }

/** Portfolio map: one pin per project, coloured by health. */
export function ProjectMap({ projects, hrefFor }: { projects: { id: string; code: string; title: string; health: Health; location_lat: number | null; location_lng: number | null; location_label: string | null }[]; hrefFor: (p: { code: string }) => string }) {
  const placed = projects.filter((p) => p.location_lat != null && p.location_lng != null)
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${kenyaOutline.width} ${kenyaOutline.height}`} role="img" aria-label="Map of Kenya with your project locations" className="block h-auto w-full">
        <path d={kenyaOutline.d} fill="#f4f5f7" stroke="#c9ced5" strokeWidth="1" />
        <g>
          <circle cx={155.7} cy={289.5} r="3" fill="#a6812f" />
          <text x={161} y={300} fontSize="10" fill="#646b75">Nairobi</text>
        </g>
        {placed.map((p) => {
          const { x, y } = mapPoint(p.location_lat!, p.location_lng!)
          return (
            <a key={p.id} href={hrefFor(p)}>
              <title>{`${p.code} · ${p.title}${p.location_label ? ` · ${p.location_label}` : ''} · ${healthLabels[p.health]}`}</title>
              <circle cx={x} cy={y} r="9" fill={pinColor[p.health]} opacity="0.18" />
              <circle cx={x} cy={y} r="5" fill={pinColor[p.health]} stroke="#fff" strokeWidth="1.5" />
            </a>
          )
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {(['on_track', 'at_risk', 'high_risk', 'not_assessed'] as Health[]).map((h) => (
          <span key={h} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: pinColor[h] }} /> {healthLabels[h]}
          </span>
        ))}
        {placed.length < projects.length && <span>{projects.length - placed.length} without a mapped location</span>}
      </figcaption>
    </figure>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: { href: string; label: string } }) {
  return (
    <div className="panel panel-pad text-center">
      <h2 className="text-lg">{title}</h2>
      {children && <div className="mx-auto mt-2 max-w-lg text-ink-2">{children}</div>}
      {action && <Link className="btn btn-primary mt-5" href={action.href}>{action.label}</Link>}
    </div>
  )
}

export function Tabs({ tabs, active, className = '' }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string; className?: string }) {
  return (
    <nav className={`tabs no-print ${className}`} aria-label="Sections">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === active ? 'page' : undefined} scroll={false}>
          {t.label}
          {t.count ? <span className="badge ml-1.5">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  )
}

/** Staff choose when the field team expects to arrive; the client sees it with the visit date. An exact time wins over the window. */
export function ArrivalFields({ value }: { value?: string | null }) {
  const named = value && value in arrivalWindows ? value : ''
  const exact = value && !named ? value : ''
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="label">Arrival
        <select className="input" name="arrivalWindow" defaultValue={named}>
          <option value="">Not set</option>
          {Object.entries(arrivalWindows).map(([code, label]) => <option key={code} value={code}>{label[0].toUpperCase() + label.slice(1)}</option>)}
        </select>
      </label>
      <label className="label">or exact time<input className="input" type="time" name="arrivalTime" defaultValue={exact} step={900} /></label>
    </div>
  )
}

/** Where a project stands: a bar for how far along it is, the step that is waiting and on whom, then every step. */
export function ProjectProgress({ steps, viewer }: { steps: ProgressStep[]; viewer: 'client' | 'staff' }) {
  const done = steps.filter((s) => s.state === 'done').length
  const current = steps.find((s) => s.state === 'current')
  const who = (o: ProgressStep['owner']) => viewer === 'client' ? (o === 'client' ? 'Waiting on you' : 'With our team') : (o === 'client' ? 'Waiting on the client' : 'Waiting on the team')
  const pct = Math.round((done / steps.length) * 100)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm">
          {current ? <><span className="text-muted">Now: </span><strong>{current.label}</strong><span className={`ml-2 chip chip--plain ${current.owner === 'client' ? 'chip--warn' : 'chip--none'}`}>{who(current.owner)}</span></> : <strong>All steps complete</strong>}
        </p>
        <p className="text-sm text-muted">{done} of {steps.length} done</p>
      </div>
      <span className="meter block" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={steps.length} aria-label={`${done} of ${steps.length} steps done`}><span style={{ width: `${pct}%` }} /></span>
      <ol className="grid gap-x-5 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((s) => (
          <li key={s.key} className="flex items-start gap-2 text-sm" aria-current={s.state === 'current' ? 'step' : undefined}>
            <span aria-hidden className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[0.6rem] font-bold ${s.state === 'done' ? 'bg-ink text-white' : s.state === 'current' ? 'border-2 border-gold' : 'border border-line-strong'}`}>{s.state === 'done' ? '✓' : ''}</span>
            <span className="min-w-0">
              <span className={`block leading-snug ${s.state === 'current' ? 'font-semibold text-ink' : s.state === 'done' ? 'text-ink-2' : 'text-muted'}`}>{s.label}<span className="sr-only">{s.state === 'done' ? ': done' : s.state === 'current' ? ': current step' : ': to come'}</span></span>
              {s.detail && <span className="block text-xs text-muted">{s.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
