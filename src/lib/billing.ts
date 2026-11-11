/** Whole-shilling deposit, calculated from the final client-approved fee. */
export function requiredDeposit(amount: number) {
  return Math.round(amount * 60 / 100)
}

export const standardPaymentTerms = '60% of the approved fee is due before work starts. The remaining 40% is due before the final report is released. Pay securely in your portal, or use the payment details on your invoice.'

export type EditableInvoiceLine = { label: string; detail?: string; amount: number }

export function invoiceRevisionProblem(lines: EditableInvoiceLine[], approvedAmount: number, reason: string) {
  if (reason.trim().length < 5) return 'Explain the change so the client can understand it.'
  if (!lines.length || lines.length > 50 || lines.some(l => !l.label.trim() || l.label.length > 200 || (l.detail?.length ?? 0) > 200 || !Number.isSafeInteger(l.amount) || Math.abs(l.amount) > 100000000))
    return 'Add a description and a whole KES amount for each line. Use a negative amount for a discount.'
  const total = lines.reduce((sum, l) => sum + l.amount, 0)
  if (total <= 0 || total > 100000000) return 'The revised invoice total must be above zero and no more than KES 100,000,000.'
  if (total > approvedAmount) return 'The revised total exceeds the approved amount. Agree additional work with the client before issuing a supplementary invoice.'
  return null
}
