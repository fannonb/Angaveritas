import { describe, expect, it } from 'vitest'
import { invoiceRevisionProblem, requiredDeposit } from '@/lib/billing'

describe('agreed fee and invoice revisions', () => {
  it('uses the discounted approved total and rounds once to whole shillings', () => {
    expect(requiredDeposit(10000)).toBe(6000)
    expect(requiredDeposit(10000-1500)).toBe(5100)
    expect(requiredDeposit(9999)).toBe(5999)
  })
  it('allows discounts and restoration within the original agreement', () => {
    expect(invoiceRevisionProblem([{label:'Agreed fee',amount:10000},{label:'Discount',amount:-2000}],10000,'Client discount')).toBeNull()
    expect(invoiceRevisionProblem([{label:'Agreed fee',amount:10000}],10000,'Discount reversed')).toBeNull()
  })
  it('rejects increased charges, invalid totals, incomplete lines and unexplained edits', () => {
    expect(invoiceRevisionProblem([{label:'Fee',amount:11000}],10000,'Scope changed')).toContain('approved amount')
    expect(invoiceRevisionProblem([{label:'Discount',amount:-100}],10000,'Client discount')).toContain('above zero')
    expect(invoiceRevisionProblem([{label:'Fee',amount:1.5}],10000,'Client discount')).toContain('whole KES')
    expect(invoiceRevisionProblem([{label:'',amount:100}],10000,'Client discount')).toContain('description')
    expect(invoiceRevisionProblem([{label:'Fee',amount:100}],10000,'')).toContain('Explain')
  })
})
