// The service catalogue. Home, Services, Pricing and the contact form all read from this list.
// fromKes is the base professional fee (matches the calculator defaults), before travel, complexity, add-ons and speed.
// calculatorCode links a service to the pricing calculator.
// situation and outcome are the plain-language labels used by the homepage service chooser.
export type Service = { slug: string; title: string; situation: string; outcome: string; question: string; icon: string; summary: string; useWhen: string[]; checks: string[]; fromKes: number; unit?: string; calculatorCode?: string }
export const services: Service[] = [
  {
    slug: 'ground-verification',
    calculatorCode: 'ground_verification',
    icon: 'mapPinArea',
    title: 'Ground Verification',
    situation: 'Check land or property',
    outcome: 'Confirmation that the site exists and matches what you were told.',
    question: 'Does this site, business or asset really exist?',
    summary: 'We visit in person and confirm what is there, what condition it is in, and whether it matches what you were told.',
    useWhen: ['Before paying a deposit on land, property or equipment', 'When a project owner sends updates you cannot check', 'Before visiting Kenya to sign anything'],
    checks: ['Physical existence and location (GPS)', 'Site condition, access and surroundings', 'Whether operations are actually running', 'Match between what you were told and what is there'],
    fromKes: 15000,
  },
  {
    slug: 'supplier-verification',
    calculatorCode: 'supplier_verification',
    icon: 'handshake',
    title: 'Supplier & Contractor Verification',
    situation: 'Verify a supplier or contractor',
    outcome: 'A clear view of whether they are real and able to deliver.',
    question: 'Can I trust this supplier or contractor?',
    summary: 'We check that a supplier or contractor is real, reachable and capable of delivering before you sign or pay.',
    useWhen: ['Before paying a new supplier', 'Before awarding a construction contract', 'When a vendor cannot be reached in person'],
    checks: ['Premises and contact details', 'Evidence of past and current work', 'Capacity: equipment, staff, stock', 'References and red flags'],
    fromKes: 18000,
  },
  {
    slug: 'project-monitoring',
    calculatorCode: 'project_monitoring',
    icon: 'hardHat',
    title: 'Project Monitoring',
    situation: 'Monitor a build',
    outcome: 'Progress compared against the plan, with photos at every visit.',
    question: 'Is my project progressing the way I am being told?',
    summary: 'Scheduled site visits that compare real progress against the plan, with photos and video each time.',
    useWhen: ['Building a house or commercial property from abroad', 'Releasing money in stages to a contractor', 'A project has gone quiet or updates feel vague'],
    checks: ['Progress against milestones', 'Workforce and materials on site', 'Quality issues visible on inspection', 'Changes since the last visit'],
    fromKes: 25000,
    unit: 'per visit',
  },
  {
    slug: 'due-diligence',
    calculatorCode: 'due_diligence',
    icon: 'storefront',
    title: 'Business Due Diligence',
    situation: 'Assess a business opportunity',
    outcome: 'An independent check on the business before you invest or partner.',
    question: 'Is this business what the owner says it is?',
    summary: 'An independent investigation of a business or opportunity before you invest, buy in or partner.',
    useWhen: ['Buying into or acquiring an SME', 'Partnering with a local operator', 'Lending to or investing in a business'],
    checks: ['Premises, operations and staff', 'Key documents and registrations', 'Interviews with stakeholders', 'Inconsistencies and risks'],
    fromKes: 35000,
  },
  {
    slug: 'feasibility',
    calculatorCode: 'feasibility',
    icon: 'chartLineUp',
    title: 'Feasibility & Market Study',
    situation: 'Test a new venture',
    outcome: 'Demand, costs and risks researched locally before you commit.',
    question: 'Will this business idea work here?',
    summary: 'Research on the ground into demand, costs, competition and risks before you commit money to a new venture.',
    useWhen: ['Starting a farm, shop, rental or other venture', 'Choosing between locations or counties', 'Testing numbers someone else has given you'],
    checks: ['Local demand and competition', 'Input costs and suppliers', 'Site and location suitability', 'Regulatory requirements and risks'],
    fromKes: 50000,
  },
  {
    slug: 'oversight-retainer',
    title: 'Investment Oversight Retainer',
    situation: 'Keep watch every month',
    outcome: 'Regular inspections and early warning when something changes.',
    icon: 'binoculars',
    question: 'I need someone watching my investment every month.',
    summary: 'Ongoing oversight with scheduled inspections, monthly reporting and early warning when something changes.',
    useWhen: ['Several projects or properties to keep an eye on', 'Long builds or operating businesses', 'You want one trusted contact on the ground'],
    checks: ['Scheduled inspections', 'Monthly status reporting', 'Escalation when risks appear', 'Tracking against previous visits'],
    fromKes: 25000,
    unit: 'per month',
  },
]
// Services grouped by where the visitor is in an investment, not by service type. Used by Home and Services.
export const stages = [
  { id: 'before-you-pay', label: 'Before you pay', blurb: 'Confirm the land, asset or supplier is real before any money moves.', slugs: ['ground-verification', 'supplier-verification'], image: '/images/field/field-aerial.webp', alt: 'Aerial view of surveyed plots with access roads' },
  { id: 'before-you-invest', label: 'Before you invest', blurb: 'Test the business or the idea before you commit capital to it.', slugs: ['due-diligence', 'feasibility'], image: '/images/hero/hero-supplier-farm.webp', alt: 'Inspector at the gate of a greenhouse farm' },
  { id: 'after-you-invest', label: 'After you invest', blurb: 'Keep an independent eye on progress once your money is committed.', slugs: ['project-monitoring', 'oversight-retainer'], image: '/images/hero/hero-construction.webp', alt: 'Inspector recording progress on a building site' },
]

// icon names refer to the Icon set in components/site/ui.tsx.
export const included: [string, string, string][] = [
  ['file', 'Written report', 'Executive summary, findings, risks and recommendations.'],
  ['camera', 'Photographs', 'High-resolution, time-stamped and geotagged, each with an evidence ID.'],
  ['video', 'Video walkthrough', 'So you can see the site as if you had visited.'],
  ['pin', 'GPS confirmation', 'Coordinates and a map reference for where we were.'],
  ['shield', 'Confidence ratings', 'Every key finding marked High, Moderate or Limited.'],
  ['alert', 'Risk matrix', 'Each risk rated, with the action needed to resolve it.'],
]

export const addOns: [string, string][] = [
  ['Drone survey', 'Aerial imagery for farms, large sites and construction.'],
  ['Executive presentation', 'A slide deck for your board, lender or partners.'],
  ['Recurring monitoring', 'Weekly, monthly or quarterly follow-up visits.'],
]

export const formatKes = (n: number) => `KES ${n.toLocaleString('en-US')}`
