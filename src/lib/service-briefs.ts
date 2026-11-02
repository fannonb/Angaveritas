import type { ProjectStage } from './labels'

export type BriefField = {
  key: string; label: string; type: 'text' | 'textarea' | 'select' | 'date' | 'url'
  step: 0 | 1; required?: boolean; placeholder?: string; hint?: string; options?: string[]; sensitive?: boolean
}
export type ServiceBriefRecord = { version: 1; profile: string; answers: Record<string, string> }
export type BriefContext = { service_code?: string | null; service_name?: string | null; engagement?: string }
export type BriefProfile = {
  code: string; name: string; tab: string; title: string; intro: string; identity: string; scope: string
  location: string; locationHint: string; physicalLocation: boolean; directions: string; access: string
  claims: string; claimsExample: string; value: string; people: string; peopleHint: string; documents: string[]
  activity: string; fields: BriefField[]; checks: string[]; requestExample: string
}
const field = (key: string, label: string, step: 0 | 1, required = false, extra: Partial<BriefField> = {}): BriefField =>
  ({ key, label, step, required, type: 'textarea', ...extra })
const choice = (key: string, label: string, step: 0 | 1, options: string[], required = true) => field(key, label, step, required, { type: 'select', options })
const contactApproach = choice('contact_approach', 'How may we approach the organisation?', 1,
  ['You may contact them directly', 'Arrange an introduction with me first', 'Do not contact them until we agree an approach'])
const decisionDate = field('decision_date', 'Decision deadline', 1, false, { type: 'date', hint: 'If there is a contract, payment or investment deadline, tell us the date.' })

export const briefProfiles: Record<string, BriefProfile> = {
  ground_verification: {
    code: 'ground_verification', name: 'Ground Verification', tab: 'Site & asset details', title: 'About the site or asset',
    intro: 'Identify what we should verify, where to find it and the claims you need checked.', identity: 'Site or asset', scope: 'Verification priorities',
    location: 'Site or asset location', locationHint: 'Town, area or landmark. Add directions below if the address is incomplete.', physicalLocation: true,
    directions: 'Directions, map pin or reference', access: 'Access arrangements', claims: 'Claims about the site or asset',
    claimsExample: 'The equipment is installed and operating. The plot has road access. The building matches the advertised condition.', value: 'Investment or asset value, KES',
    people: 'Owner, seller & access contacts', peopleHint: 'Owners, selling agents, caretakers or someone who can arrange access.',
    documents: ['Location pin, plot/LR number or asset serial number', 'Listing, photographs or specifications', 'Relevant ownership or transaction documents, if available'],
    activity: 'Site visit', requestExample: 'Plot verification in Kitengela',
    fields: [choice('asset_type', 'What are we verifying?', 0, ['Land or plot', 'Building or property', 'Equipment or other asset', 'Operating premises', 'Other']),
      field('asset_identity', 'Site or asset description', 0, true, { hint: 'Describe the property, equipment or premises clearly enough to identify it.' }),
      field('reference_numbers', 'Plot, LR, serial or listing references', 0), field('decision', 'What decision will this verification help you make?', 1, true), decisionDate],
    checks: ['Confirm the physical subject and its location', 'Record condition, access and surroundings', 'Compare observed evidence with the client’s claims'],
  },
  supplier_verification: {
    code: 'supplier_verification', name: 'Supplier & Contractor Verification', tab: 'Supplier details', title: 'About the supplier or contractor',
    intro: 'Tell us who they are, what they propose to supply or build, and what you need verified before proceeding.', identity: 'Supplier & proposed work', scope: 'Capacity, promises & approach',
    location: 'Supplier premises or operating area', locationHint: 'If you know the address, add it here. An unknown premises address does not prevent sending this brief.', physicalLocation: false,
    directions: 'Premises address or directions, if known', access: 'Meeting or premises-access arrangements', claims: 'Supplier promises or capacity claims to verify',
    claimsExample: 'They hold 500 units in stock. They manufacture in-house. They have completed three similar projects.', value: 'Proposed order or contract value, KES',
    people: 'Supplier contacts & references', peopleHint: 'Sales or project contacts, directors, referees or past clients. Set contact permission for each person.',
    documents: ['Quotation, pro forma invoice or draft contract', 'Product specifications, bill of quantities or delivery schedule', 'Registration/licence information and portfolio/reference evidence, if available'],
    activity: 'Supplier verification', requestExample: 'Verify a building-material supplier in Sondu',
    fields: [field('supplier_name', 'Supplier or contractor name', 0, true, { type: 'text', hint: 'Use the trading name if you do not know the registered name.' }),
      field('supply_scope', 'Goods, services or proposed work', 0, true, { placeholder: 'What are they supplying or building? Include quantities or specifications if known.' }),
      field('registration', 'Registration or licence references', 0), field('website', 'Website or portfolio URL', 0, false, { type: 'url', placeholder: 'https://…' }),
      choice('relationship', 'What stage are you at with this supplier?', 1, ['Considering a new supplier', 'Before signing or paying', 'An existing order or contract has concerns']),
      field('delivery_expectations', 'Delivery dates, capacity or experience that matters', 1), contactApproach, decisionDate],
    checks: ['Confirm supplier identity, premises and contact details', 'Assess relevant stock, equipment, staff or operating capacity', 'Check evidence of comparable past and current work', 'Review approved references and inconsistencies'],
  },
  project_monitoring: {
    code: 'project_monitoring', name: 'Project Monitoring', tab: 'Monitoring brief', title: 'Project progress & monitoring plan',
    intro: 'Give us the agreed baseline and the milestones to compare with actual progress.', identity: 'Project & baseline', scope: 'Milestones & reporting',
    location: 'Project location', locationHint: 'Tell us which project location the monitoring covers.', physicalLocation: true,
    directions: 'Directions or site pin', access: 'Visit and contractor-access arrangements', claims: 'Progress claims to verify on the next visit',
    claimsExample: 'The roof is complete. Materials for the next stage are on site. Work matches the approved drawings.', value: 'Project budget or investment value, KES',
    people: 'Project team & access contacts', peopleHint: 'Contractor, site manager, architect, project manager or someone arranging access.',
    documents: ['Programme, milestones or work schedule', 'Drawings, bill of quantities or scope of work', 'Previous progress reports, photographs and relevant payment-stage records'],
    activity: 'Monitoring visit', requestExample: 'Monitor a house build in Nyeri',
    fields: [field('project_type', 'What is being built or carried out?', 0, true), field('baseline_status', 'Current stage and latest known progress', 0, true),
      field('baseline_date', 'Date of the latest baseline or update', 0, false, { type: 'date' }),
      field('milestones', 'Milestones or deliverables we should compare against', 1, true, { placeholder: 'One milestone per line, with a target date or standard where available.' }),
      choice('reporting_cadence', 'Preferred monitoring/reporting frequency', 1, ['One visit', 'Weekly', 'Fortnightly', 'Monthly', 'At agreed milestones', 'Agree with the analyst']),
      field('escalation_triggers', 'Delays, quality issues or changes to flag immediately', 1), decisionDate],
    checks: ['Compare current progress with the agreed baseline and milestones', 'Record workforce, materials and visible workmanship', 'Identify changes, delays and outstanding issues since the last update'],
  },
  due_diligence: {
    code: 'due_diligence', name: 'Business Due Diligence', tab: 'Business details', title: 'Business & proposed transaction',
    intro: 'Identify the business, the proposed investment or partnership, and the questions that affect your decision.', identity: 'Business & transaction', scope: 'Questions, evidence & approach',
    location: 'Business premises or operating area', locationHint: 'Provide known locations; you do not need an exact site pin to begin the investigation.', physicalLocation: false,
    directions: 'Known business addresses', access: 'Interview, disclosure or access arrangements', claims: 'Business claims to verify',
    claimsExample: 'The business operates from these premises. It holds the stated licences. The reported customer base is active.', value: 'Proposed investment or transaction value, KES',
    people: 'Management, owners & approved interview contacts', peopleHint: 'People who can explain operations or provide approved references. Record restrictions on contacting them.',
    documents: ['Company profile, registration and relevant licences', 'Proposed transaction terms and ownership information', 'Available financial summaries, material contracts and evidence supporting key claims'],
    activity: 'Business investigation', requestExample: 'Assess an investment in a Nairobi business',
    fields: [field('business_name', 'Business or trading name', 0, true, { type: 'text' }),
      choice('transaction_type', 'Proposed transaction', 0, ['Investment', 'Acquisition or business purchase', 'Partnership or joint venture', 'Lending or credit exposure', 'Other']),
      field('business_activity', 'What does the business do?', 0, true), field('registration_ownership', 'Known registration, ownership or key people', 0),
      field('decision_questions', 'What must you establish before proceeding?', 1, true),
      field('financial_context', 'Financial periods or business assumptions to examine', 1, false, { sensitive: true, hint: 'Summarise the records available; upload supporting documents separately.' }), contactApproach, decisionDate],
    checks: ['Confirm business identity, premises and operations', 'Compare registrations and relevant records with the business claims', 'Conduct approved stakeholder interviews and reference checks', 'Record inconsistencies, information gaps and material risks'],
  },
  feasibility: {
    code: 'feasibility', name: 'Feasibility & Market Study', tab: 'Study brief', title: 'Venture, market & research questions',
    intro: 'Describe the proposed venture and the questions the study must answer. You do not need an existing business or site.', identity: 'Venture & target market', scope: 'Assumptions & research questions',
    location: 'Study area or target markets', locationHint: 'A town, county, market area or shortlist of locations is enough; an exact premises address is not required.', physicalLocation: false,
    directions: '', access: 'Research, interview or access constraints', claims: 'Assumptions or claims the study should test',
    claimsExample: 'Customers will buy at this price. Local input costs support the budget. There is unmet demand in this area.', value: 'Indicative venture budget, KES',
    people: 'Relevant market or industry contacts', peopleHint: 'Potential customers, operators, suppliers or local contacts whose input may help the study.',
    documents: ['Business concept, plan or pitch', 'Financial model, budget and key assumptions, if available', 'Existing research, competitor information or candidate-location notes'],
    activity: 'Field research', requestExample: 'Test demand for a cold-storage venture in Kisumu',
    fields: [field('venture_concept', 'Proposed venture, product or service', 0, true), field('target_customers', 'Who are the intended customers?', 0, true),
      field('research_questions', 'What must the study answer?', 1, true, { placeholder: 'Demand, pricing, competition, costs, location suitability or route to market…' }),
      field('success_criteria', 'What would make you proceed, revise the idea or stop?', 1), field('known_competitors', 'Known competitors or alternatives', 1),
      field('budget_assumptions', 'Key cost or revenue assumptions', 1, false, { sensitive: true }), field('target_launch', 'Target launch date', 1, false, { type: 'date' })],
    checks: ['Investigate target customers, demand and competing alternatives', 'Research relevant input costs and supplier options', 'Assess candidate locations and operating constraints', 'Test the stated assumptions and identify evidence gaps'],
  },
  oversight_retainer: {
    code: 'oversight_retainer', name: 'Investment Oversight Retainer', tab: 'Oversight brief', title: 'Portfolio & oversight priorities',
    intro: 'Describe what is under oversight, the reporting you need and the situations that should trigger an alert.', identity: 'Portfolio & coverage', scope: 'Reporting & escalation',
    location: 'Coverage area or asset locations', locationHint: 'List the locations covered. Individual assets and access arrangements can be confirmed with your analyst.', physicalLocation: false,
    directions: 'Asset locations and directions, if relevant', access: 'Access and coordination arrangements', claims: 'Ongoing commitments or claims to monitor',
    claimsExample: 'The property is occupied. Operations follow the agreed plan. Maintenance commitments are being met.', value: 'Portfolio or investment value, KES',
    people: 'Asset managers & coordination contacts', peopleHint: 'Local managers, caretakers, operators or your authorised representatives.',
    documents: ['Asset or project list and current status', 'Existing management agreements, plans and baseline reports', 'Reporting expectations and escalation/contact instructions'],
    activity: 'Oversight review', requestExample: 'Monthly oversight of rental properties in Kenya',
    fields: [field('portfolio', 'Assets, businesses or projects to oversee', 0, true, { placeholder: 'List each asset, its location and current status.' }),
      field('oversight_objectives', 'What do you need ongoing oversight to establish?', 1, true),
      choice('reporting_cadence', 'Preferred reporting frequency', 1, ['Weekly', 'Fortnightly', 'Monthly', 'At agreed milestones', 'Agree with the analyst']),
      field('escalation_triggers', 'What needs immediate escalation?', 1, true), field('report_recipients', 'Reporting recipients and escalation contacts', 1),
      field('baseline', 'Existing baseline, previous issues or outstanding commitments', 0)],
    checks: ['Review the agreed assets and operating commitments', 'Compare status with the prior baseline and report', 'Record emerging risks and matters requiring escalation'],
  },
  custom: {
    code: 'custom', name: 'Custom engagement', tab: 'Engagement brief', title: 'About the engagement',
    intro: 'Describe the subject and the answers you need. Your analyst will confirm the preparation required for the agreed scope.', identity: 'Subject & context', scope: 'Outcomes & constraints',
    location: 'Relevant location or coverage area', locationHint: 'Add a location if the agreed work requires one.', physicalLocation: false, directions: '', access: 'Coordination or access constraints',
    claims: 'Specific claims or assumptions to check', claimsExample: 'Add one claim per line, if there are specific statements to verify.', value: 'Investment context, KES',
    people: 'Relevant contacts', peopleHint: 'People connected to the agreed work, with any restrictions on contacting them.',
    documents: ['The agreed scope or request', 'Background information relevant to your questions', 'Records supporting any claims you want checked'],
    activity: 'Agreed work', requestExample: 'Independent verification for an investment decision',
    fields: [field('subject', 'What is the subject of this engagement?', 0, true), field('outcomes', 'What questions or decisions must the work address?', 1, true),
      field('context', 'Current situation and background', 0), field('constraints', 'Important timing or scope constraints', 1), decisionDate],
    checks: ['Confirm the subject and agreed scope', 'Collect evidence addressing the client’s questions', 'Record findings, limitations and unresolved information gaps'],
  },
}

export function briefProfile(context: BriefContext = {}): BriefProfile {
  const raw = context.service_code?.replace(/-/g, '_')
  if (raw && Object.hasOwn(briefProfiles,raw)) return briefProfiles[raw]
  const name = context.service_name?.trim().toLowerCase()
  if (name) {
    const matched = Object.values(briefProfiles).find(profile => profile.name.toLowerCase() === name)
    if (matched) return matched
  }
  return !raw && context.engagement === 'retainer' ? briefProfiles.oversight_retainer : briefProfiles.custom
}
export function briefStageLabels(profile: BriefProfile): Partial<Record<ProjectStage, string>> {
  return { onboarding: profile.tab, planning: 'Planning the work', fieldwork: profile.activity, analysis: 'Checking the evidence', delivered: 'Report ready', monitoring: 'Ongoing oversight' }
}
export function briefAnswers(profile: BriefProfile, value: unknown): Record<string, string> {
  const record = value as Partial<ServiceBriefRecord> | null
  if (record?.version !== 1 || record.profile !== profile.code || !record.answers || typeof record.answers !== 'object') return {}
  return Object.fromEntries(profile.fields.filter(f => typeof record.answers?.[f.key] === 'string').map(f => [f.key, record.answers![f.key]]))
}
export function validateServiceBrief(profile: BriefProfile, raw: Record<string, unknown>, final: boolean) {
  const answers: Record<string, string> = {}
  for (const f of profile.fields) {
    const input = raw[f.key]
    const value = typeof input === 'string' ? input.trim() : ''
    if (value.length > 2000) return { error: `${f.label}: use at most 2,000 characters.`, field: f.key }
    if (final && f.required && !value) return { error: `Please complete “${f.label}”.`, field: f.key }
    if (value && f.type === 'select' && !f.options?.includes(value)) return { error: `Choose a valid option for “${f.label}”.`, field: f.key }
    if (value && f.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) return { error: `Enter a valid date for “${f.label}”.`, field: f.key }
    if (value && f.type === 'url') {
      try { if (!['http:', 'https:'].includes(new URL(value).protocol)) throw new Error() } catch { return { error: `Enter a full http(s) URL for “${f.label}”.`, field: f.key } }
    }
    answers[f.key] = value
  }
  return { brief: { version: 1, profile: profile.code, answers } as ServiceBriefRecord }
}
export function suggestedChecks(profile: BriefProfile, claims: string | null) {
  return [...new Set([...profile.checks, ...(claims ?? '').split('\n').map(line => line.trim()).filter(Boolean)])].join('\n')
}
