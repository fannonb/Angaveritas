// The five complexity questions (Pricing Calculator Costing Logic,
// "Make the Calculator Smarter"). Each answer scores 1–3; the total (5–15)
// selects the complexity tier.

export const complexityQuestions = [
  {
    id: 'locations',
    question: 'How many locations need to be verified?',
    options: ['One', 'Two to three', 'Four or more'],
  },
  {
    id: 'stakeholders',
    question: 'How many organisations or people need to be verified?',
    options: ['One', 'Two to five', 'More than five'],
  },
  {
    id: 'documents',
    question: 'What level of document review is needed?',
    options: ['Basic documents only', 'Several operational or financial documents', 'Extensive legal, financial and regulatory documents'],
  },
  {
    id: 'fieldwork',
    question: 'What field activities are needed?',
    options: ['Site visit only', 'Site visit plus interviews', 'Multiple visits, interviews and evidence collection'],
  },
  {
    id: 'report',
    question: 'What type of report do you need?',
    options: ['Verification summary', 'Detailed findings report', 'Executive intelligence report with recommendations'],
  },
] as const

export type ComplexityAnswers = [number, number, number, number, number]

export const standardDeliverables = [
  'Verification report with executive summary',
  'High-resolution photo archive',
  'Video walkthrough',
  'GPS location confirmation',
  'Confidence rating on every key finding',
  'Risk matrix',
]
