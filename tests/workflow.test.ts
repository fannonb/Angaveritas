import { describe, expect, it } from 'vitest'
import { clientNextStep, projectProgress, fieldworkProblem, filePermission, isTechnicalAuditEvent, projectTransitionProblem, reportContentProblems, requestStatusTargets, requestTransitionAllowed, staffNextStep, staffRequestNextStep } from '@/lib/workflow'
import { uploadProblem } from '@/lib/upload-validation'

const ready = { onboarding_submitted_at: new Date(), data_consent_at: new Date(), payment_status: 'paid', lead_analyst_id: 'lead' }
describe('engagement prerequisites', () => {
  it('blocks fieldwork without consent, payment or assignments', () => {
    expect(fieldworkProblem(ready, 'agent')).toBeNull()
    expect(fieldworkProblem({ ...ready, data_consent_at: null }, 'agent')).toContain('consent')
    expect(fieldworkProblem({ ...ready, payment_status: 'awaiting_payment' }, 'agent')).toContain('payment')
    expect(fieldworkProblem(ready, null)).toContain('Assign')
    expect(fieldworkProblem({ ...ready, nda_status:'requested' }, 'agent')).toContain('confidentiality')
    expect(fieldworkProblem({ ...ready, nda_status:'prepared' }, 'agent')).toContain('signed')
    expect(fieldworkProblem({ ...ready, nda_status:'signed' }, 'agent')).toBeNull()
  })
  it('does not let status editing fabricate contract acceptance or delivery', () => {
    expect(requestTransitionAllowed('submitted', 'accepted')).toBe(false)
    expect(requestTransitionAllowed('in_review', 'proposal_sent')).toBe(false)
    expect(requestTransitionAllowed('submitted', 'in_review')).toBe(true)
    expect(projectTransitionProblem('planning', 'delivered')).toBeTruthy()
  })
  it('offers staff only the request moves that are actually valid', () => {
    expect(requestStatusTargets('submitted')).toEqual(['in_review', 'closed'])
    expect(requestStatusTargets('proposal_sent')).toEqual(['closed'])
    expect(requestStatusTargets('accepted')).toEqual(['closed'])
    expect(requestStatusTargets('closed')).toEqual([])
  })
  it('separates database audit rows from the human history', () => {
    expect(isTechnicalAuditEvent('requests.update')).toBe(true)
    expect(isTechnicalAuditEvent('proposals.insert')).toBe(true)
    expect(isTechnicalAuditEvent('service_requests.insert')).toBe(true)
    expect(isTechnicalAuditEvent('project.assigned')).toBe(false)
    expect(isTechnicalAuditEvent('proposal.sent')).toBe(false)
  })
  it('requires substantive reports and reviewed supporting data', () => {
    expect(reportContentProblems({ executive_summary: '', overall_status: null, scope: '', methodology: '', recommendations: '', limitations: '' }, 0, 0)).toHaveLength(8)
  })
})
describe('private file permissions', () => {
  const client = { id: 'client', role: 'client' as const }
  const agent = { id: 'agent', role: 'field_agent' as const }
  const file = { category: 'client_document', uploaded_by: 'client', visible_to_client: false, field_access: false, inspection_id: null }
  const context = { ownsProject: true, assignedInspection: false, publishedReport: false }
  it('isolates clients and blocks internal files', () => {
    expect(filePermission(client, file, context)).toBe(true)
    expect(filePermission(client, file, { ...context, ownsProject: false })).toBe(false)
    expect(filePermission(client, { ...file, category: 'internal', visible_to_client: true }, context)).toBe(false)
  })
  it('requires a currently published report even if a PDF was previously visible', () => {
    expect(filePermission(client, { ...file, category: 'report', visible_to_client: true }, context)).toBe(false)
    expect(filePermission(client, { ...file, category: 'report' }, { ...context, publishedReport: true })).toBe(true)
  })
  it('limits agents to approved documents and assigned inspection evidence', () => {
    expect(filePermission(agent, file, context)).toBe(false)
    expect(filePermission(agent, { ...file, field_access: true }, context)).toBe(true)
    expect(filePermission(agent, { ...file, category: 'internal', field_access: true }, context)).toBe(false)
    expect(filePermission(agent, { ...file, category: 'evidence', inspection_id: 'inspection' }, context)).toBe(false)
    expect(filePermission(agent, { ...file, category: 'evidence', inspection_id: 'inspection' }, { ...context, assignedInspection: true })).toBe(true)
  })
})
describe('upload content checks', () => {
  it('rejects spoofed MIME and mismatched sizes', () => {
    expect(uploadProblem('image/jpeg', 4, 4, Buffer.from('evil'))).toContain('type')
    expect(uploadProblem('application/pdf', 10, 6, Buffer.from('%PDF-'))).toContain('size')
  })
  it('accepts expected signatures and rejects binary text', () => {
    expect(uploadProblem('image/jpeg', 3, 3, Buffer.from([255,216,255]))).toBeNull()
    expect(uploadProblem('text/plain', 3, 3, Buffer.from([65,0,66]))).toContain('type')
  })
})

describe('staff next step', () => {
  const base = { stage: 'planning' as const, onboarding_submitted_at: new Date(), data_consent_at: new Date(), payment_status: 'paid', lead_analyst_id: 'lead', field_agent_id: 'agent' }
  it('after acceptance, puts team work first and then names everything the client still owes', () => {
    const fresh = { ...base, onboarding_submitted_at: null, data_consent_at: null, payment_status: 'awaiting_payment', field_agent_id: null }
    expect(staffNextStep(fresh, [], [], 0)?.title).toBe('Assign the team')
    const waiting = staffNextStep({ ...fresh, field_agent_id: 'agent' }, [], [], 0)
    expect(waiting?.title).toBe('Waiting on the client')
    expect(waiting?.text).toContain('send the brief and consent and pay the deposit')
    expect(waiting?.tab).toBe('messages')
    expect(staffNextStep({ ...base, payment_status: 'awaiting_payment' }, [], [], 0, 0, true)?.title).toBe('Confirm the deposit')
    expect(staffNextStep({ ...base, brief_approved: false }, [], [], 0)?.title).toBe('Check the brief against the scope')
    expect(staffNextStep({ ...base, nda_status: 'requested' }, [], [], 0)?.tab).toBe('agreement')
  })
  it('walks a project from onboarding to delivery', () => {
    expect(staffNextStep({ ...base, onboarding_submitted_at: null }, [], [], 0)?.title).toBe('Waiting on the client')
    expect(staffNextStep({ ...base, field_agent_id: null }, [], [], 0)?.tab).toBe('overview')
    expect(staffNextStep({ ...base, payment_status: 'awaiting_payment' }, [], [], 0)?.text).toContain('pay the deposit')
    expect(staffNextStep(base, [], [], 0)?.title).toBe('Schedule the site visit')
    expect(staffNextStep(base, [{ status: 'scheduled' }], [], 0)?.title).toBe('Visit booked')
    expect(staffNextStep(base, [{ status: 'scheduled', scheduled_for: null }], [], 0)?.title).toBe('Set the visit date')
    expect(staffNextStep(base, [{ status: 'in_progress' }], [], 0)?.title).toBe('Fieldwork under way')
    expect(staffNextStep(base, [{ status: 'submitted' }], [], 0)?.title).toBe('Review the submitted inspection')
    expect(staffNextStep(base, [{ status: 'reviewed' }], [], 0)?.title).toBe('Write the report')
    expect(staffNextStep(base, [{ status: 'reviewed' }], [{ status: 'in_review' }], 0)?.tab).toBe('reports')
    expect(staffNextStep({ ...base, stage: 'delivered' }, [{ status: 'reviewed' }], [{ status: 'published' }], 0)?.title).toBe('Report delivered')
  })
  it('keeps delivered reports ahead of held historical evidence and says nothing on closed projects', () => {
    expect(staffNextStep({ ...base, stage:'delivered' }, [{ status: 'reviewed' }], [{ status: 'published' }], 2)?.title).toBe('Report delivered')
    expect(staffNextStep(base, [{ status: 'reviewed' }], [], 2)?.tab).toBe('evidence')
    expect(staffNextStep({ ...base, stage: 'closed' }, [], [], 3)).toBeNull()
  })
})

describe('client next step', () => {
  const p = { code: 'AVP-1', service_code:'ground_verification', stage: 'planning' as const, onboarding_submitted_at: new Date() }
  const fmt = (d: string) => d
  it('asks for site details, then payment, before anything else', () => {
    expect(clientNextStep({ ...p, stage: 'onboarding', onboarding_submitted_at: null }, [], [], { amount: 'KES 3,000', invoice: 'AVB-1' }, fmt).action?.href).toBe('/portal/projects/AVP-1?tab=onboarding')
    const pay = clientNextStep(p, [], [], { amount: 'KES 3,000', invoice: 'AVB-1' }, fmt)
    expect(pay.title).toBe('Pay the deposit')
    expect(pay.text).toContain('KES 3,000')
    expect(pay.action?.href).toBe('/portal/projects/AVP-1?tab=operations')
  })
  it('follows the visit, the review and the report', () => {
    expect(clientNextStep(p, [], [], null, fmt).title).toBe('Planning your visit')
    expect(clientNextStep(p, [{ status: 'scheduled', scheduled_for: '2026-11-03' }], [], null, fmt).title).toBe('Site visit on 2026-11-03')
    expect(clientNextStep(p, [{ status: 'in_progress', scheduled_for: null }], [], null, fmt).title).toBe('We are at the site')
    expect(clientNextStep(p, [{ status: 'submitted', scheduled_for: null }], [], null, fmt).title).toBe('Checking the evidence')
    expect(clientNextStep(p, [{ status: 'reviewed', scheduled_for: null }], [], null, fmt).title).toBe('Writing your report')
    const ready = clientNextStep({ ...p, stage: 'delivered' }, [{ status: 'reviewed', scheduled_for: null }], [{ id: 'r1', client_viewed_at: null }], null, fmt)
    expect(ready.action?.href).toBe('/portal/projects/AVP-1/reports/r1')
    expect(clientNextStep({ ...p, stage: 'delivered' }, [], [{ id: 'r1', client_viewed_at: new Date() }], null, fmt).title).toBe('Report delivered')
    expect(clientNextStep({ ...p, stage: 'closed' }, [], [], null, fmt).action?.href).toBe('/estimate?project=AVP-1')
  })
  it('shows a new visit ahead of an older report', () => {
    expect(clientNextStep({ ...p, stage: 'delivered' }, [{ status: 'reviewed', scheduled_for: null }, { status: 'scheduled', scheduled_for: '2026-12-01' }], [{ id: 'r1', client_viewed_at: new Date() }], null, fmt).title).toBe('Site visit on 2026-12-01')
  })
  it('waits for reconciliation after a payment notification instead of asking for another deposit', () => {
    const step=clientNextStep(p,[],[],{amount:'KES 3,000',invoice:'AVB-1',paymentNotified:true},fmt)
    expect(step.title).toBe('Confirming your payment')
    expect(step.action).toBeUndefined()
    expect(step.text).toContain('payment team')
  })
})

describe('staff request next step', () => {
  it('shows the client’s decline reason on the next step, or says none was given', () => {
    const declined = staffRequestNextStep({ status: 'declined', owner_id: 'a' }, false, 'The price is too high')
    expect(declined.title).toBe('The client declined')
    expect(declined.text).toContain('The price is too high')
    expect(staffRequestNextStep({ status: 'declined', owner_id: 'a' }, false).text).toContain('no reason')
  })
  it('names one action for each request status', () => {
    expect(staffRequestNextStep({ status: 'submitted', owner_id: null }, false).action).toBe('take')
    expect(staffRequestNextStep({ status: 'submitted', owner_id: 'a' }, false).action).toBe('start')
    expect(staffRequestNextStep({ status: 'in_review', owner_id: 'a' }, true).title).toBe('Finish the proposal')
    expect(staffRequestNextStep({ status: 'proposal_sent', owner_id: 'a' }, false).action).toBe('message')
    expect(staffRequestNextStep({ status: 'accepted', owner_id: 'a' }, false).action).toBe('project')
    expect(staffRequestNextStep({ status: 'closed', owner_id: 'a' }, false).action).toBeUndefined()
  })
})

describe('project progress', () => {
  const p = { code: 'AVP-1', stage: 'analysis' as const, service_code: 'due_diligence', service_name: 'Business Due Diligence', onboarding_submitted_at: new Date(), data_consent_at: new Date(), payment_status: 'deposit_received', nda_status: 'none', lead_analyst_id: 'a', field_agent_id: 'f' }
  const current = (steps: ReturnType<typeof projectProgress>) => steps.find((s) => s.state === 'current')
  it('points at the report once the evidence is checked, with the balance still to come', () => {
    const steps = projectProgress(p, [{ status: 'reviewed', scheduled_for: '2026-11-11' }], [], 9300, (d) => d)
    expect(current(steps)?.key).toBe('report')
    expect(current(steps)?.owner).toBe('team')
    expect(steps.find((s) => s.key === 'balance')).toMatchObject({ state: 'upcoming', detail: 'KES 9,300 to pay' })
  })
  it('asks the client for the balance once the report is published', () => {
    const steps = projectProgress(p, [{ status: 'reviewed', scheduled_for: '2026-11-11' }], [{ status: 'published' }], 9300, (d) => d)
    expect(current(steps)).toMatchObject({ key: 'balance', owner: 'client' })
  })
  it('starts with the client brief and finishes when the report can be read', () => {
    expect(current(projectProgress({ ...p, onboarding_submitted_at: null }, [], [], 18800, (d) => d))?.key).toBe('brief')
    expect(current(projectProgress(p, [{ status: 'reviewed', scheduled_for: '2026-11-11' }], [{ status: 'published' }], 0, (d) => d))).toBeUndefined()
  })
})
