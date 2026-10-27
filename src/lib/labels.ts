// Shared vocabulary. Safe to import from client components.
// Status words match the website and the reports: On track / At risk / High risk,
// confidence High / Moderate / Limited, evidence grades E1–E5.

export type Role = 'client' | 'field_agent' | 'analyst' | 'admin'
export const staffRoles: Role[] = ['field_agent', 'analyst', 'admin']
export const roleLabels: Record<Role, string> = {
  client: 'Client',
  field_agent: 'Field agent',
  analyst: 'Analyst',
  admin: 'Admin',
}

export type RequestStatus = 'submitted' | 'in_review' | 'proposal_sent' | 'accepted' | 'declined' | 'withdrawn' | 'closed'
export const requestStatusLabels: Record<RequestStatus, string> = {
  submitted: 'Submitted',
  in_review: 'In review',
  proposal_sent: 'Proposal sent',
  accepted: 'Accepted',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
  closed: 'Closed',
}

export type ProposalStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'superseded'
export const proposalStatusLabels: Record<ProposalStatus, string> = {
  draft: 'Draft',
  sent: 'Awaiting your decision',
  accepted: 'Accepted',
  declined: 'Declined',
  superseded: 'Replaced by a newer version',
}

export type ProjectStage = 'onboarding' | 'planning' | 'fieldwork' | 'analysis' | 'delivered' | 'monitoring' | 'closed'
export const projectStages: ProjectStage[] = ['onboarding', 'planning', 'fieldwork', 'analysis', 'delivered', 'monitoring', 'closed']
export const stageLabels: Record<ProjectStage, string> = {
  onboarding: 'Onboarding',
  planning: 'Planning',
  fieldwork: 'Fieldwork',
  analysis: 'Analysis & review',
  delivered: 'Report delivered',
  monitoring: 'Ongoing monitoring',
  closed: 'Closed',
}
/** The same stages in the client's words; clients never need the internal ones. */
export const clientStageLabels: Record<ProjectStage, string> = {
  onboarding: 'Site details',
  planning: 'Planning the visit',
  fieldwork: 'Site visit',
  analysis: 'Checking the evidence',
  delivered: 'Report ready',
  monitoring: 'Ongoing monitoring',
  closed: 'Complete',
}

export type Health = 'not_assessed' | 'on_track' | 'at_risk' | 'high_risk'
export const healthLabels: Record<Health, string> = {
  not_assessed: 'Not yet assessed',
  on_track: 'On track',
  at_risk: 'At risk',
  high_risk: 'High risk',
}
export const healthChip: Record<Health, 'ok' | 'warn' | 'bad' | 'none'> = {
  not_assessed: 'none',
  on_track: 'ok',
  at_risk: 'warn',
  high_risk: 'bad',
}

export type FindingStatus = 'ok' | 'warn' | 'bad' | 'unverified'
export const findingStatusLabels: Record<FindingStatus, string> = {
  ok: 'On track',
  warn: 'At risk',
  bad: 'High risk',
  unverified: 'Not verified',
}

export type Confidence = 'high' | 'moderate' | 'limited'
export const confidenceLabels: Record<Confidence, string> = { high: 'High', moderate: 'Moderate', limited: 'Limited' }

export const evidenceGrades = [
  ['E1', 'Direct observation'],
  ['E2', 'Independent confirmation'],
  ['E3', 'Original documents'],
  ['E4', 'Corroborated interview'],
  ['E5', 'Client statement only'],
] as const

export type InspectionStatus = 'scheduled' | 'in_progress' | 'submitted' | 'reviewed' | 'cancelled'
export const inspectionStatusLabels: Record<InspectionStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  submitted: 'Submitted for review',
  reviewed: 'Reviewed',
  cancelled: 'Cancelled',
}

export type ReportStatus = 'draft' | 'in_review' | 'published' | 'withdrawn'
export const reportStatusLabels: Record<ReportStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  published: 'Published',
  withdrawn: 'Withdrawn',
}

export const paymentStatusLabels: Record<string, string> = {
  awaiting_payment: 'Awaiting payment',
  deposit_received: 'Deposit received',
  paid: 'Paid',
  waived: 'Waived',
}

export const ndaStatusLabels: Record<string, string> = { none: 'Not requested', requested: 'Requested', prepared: 'Waiting for signature', signed: 'Signed' }
export const monitoringStatusLabels: Record<string, string> = { inactive: 'No plan', active: 'Active', paused: 'Paused', cancelled: 'Stopped' }
export const serviceRequestLabels: Record<string, string> = {
  cancellation: 'Cancel the work',
  monitoring_pause: 'Pause monitoring',
  monitoring_cancel: 'Stop monitoring',
  data_access: 'A copy of my project data',
  consent_withdrawal: 'Withdraw consent to use my data',
}
export const serviceRequestStatusLabels: Record<string, string> = { requested: 'Waiting for a response', completed: 'Done', declined: 'Declined' }

export const investmentBands = [
  'Under KES 1 million',
  'KES 1–5 million',
  'KES 5–20 million',
  'KES 20–100 million',
  'Over KES 100 million',
  'Prefer not to say',
]

export const decisionTimelines = ['Within a week', 'Within a month', 'In 1–3 months', 'No fixed date']

export const overallStatusLabels: Record<'ok' | 'warn' | 'bad', string> = { ok: 'On track', warn: 'At risk', bad: 'High risk' }

export const recommendedDecisions = ['Proceed', 'Conditional proceed', 'Pause pending further evidence', 'Do not proceed']
