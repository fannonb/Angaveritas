import { describe, expect, it } from 'vitest'
import { arrivalLabel, arrivalWindowOrNull } from '@/lib/labels'
import { fmtVisit } from '@/components/app/format'
import { clientNextStep } from '@/lib/workflow'

describe('visit arrival', () => {
  it('accepts named windows and exact times only', () => {
    expect(arrivalWindowOrNull('morning')).toBe('morning')
    expect(arrivalWindowOrNull('09:30')).toBe('09:30')
    expect(arrivalWindowOrNull('24:00')).toBeNull()
    expect(arrivalWindowOrNull('9am')).toBeNull()
    expect(arrivalWindowOrNull('')).toBeNull()
  })
  it('describes the arrival in Kenya time', () => {
    expect(arrivalLabel('afternoon')).toBe('afternoon, 1pm–5pm Kenya time')
    expect(arrivalLabel('09:30')).toBe('around 9:30am Kenya time')
    expect(arrivalLabel('14:00')).toBe('around 2pm Kenya time')
    expect(arrivalLabel(null)).toBeNull()
  })
  it('formats the visit day with its weekday', () => {
    expect(fmtVisit('2026-11-14', 'morning')).toBe('Sat, 14 Nov 2026, morning, 8am–12pm Kenya time')
    expect(fmtVisit('2026-11-14')).toBe('Sat, 14 Nov 2026')
    expect(fmtVisit(null)).toBe('Date to be confirmed')
  })
  it('tells the client when to expect us without asking them to act', () => {
    const p = { code: 'AVP-1', stage: 'planning' as const, service_code: 'ground_verification', service_name: 'Ground Verification', onboarding_submitted_at: new Date() }
    const step = clientNextStep(p, [{ status: 'scheduled', scheduled_for: '2026-11-14', arrival_window: '10:00' }], [], null, d => d)
    expect(step.text).toContain('around 10am Kenya time')
    expect(step.action).toBeUndefined()
    expect(clientNextStep(p, [{ status: 'scheduled', scheduled_for: null }], [], null, d => d).text).toContain('date and arrival time')
  })
})
