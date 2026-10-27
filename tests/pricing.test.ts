import { describe, expect, it } from 'vitest'
import { computeQuote, computeTravel, complexityScore, tierFor, PricingError } from '@/lib/pricing/engine'
import { configProblems, defaultPricingConfig as cfg, pricingConfigSchema } from '@/lib/pricing/config'

// Expected values are worked out by hand from the Technical Implementation
// Document §4.2 (round-trip km; fuel KES 25/km; wear KES 25/km over 50 km;
// 20% contingency over 100 km; driver KES 3,500/day over 250 km;
// accommodation KES 6,000/night over 300 km, one night per 600 km).

const lines = (km: number) => Object.fromEntries(computeTravel(km, cfg).lines.map((l) => [l.label, l.amount]))

describe('travel bands', () => {
  it.each([
    [0, 1, 0],
    [40, 1, 1000],
    [50, 1, 1250],
    [50.1, 2, 2506], // each line rounds 1,252.5 up to 1,253
    [80, 2, 4000],
    [100, 2, 5000],
    [101, 3, 6060],
    [180, 3, 10800],
    [250, 3, 15000],
    [251, 4, 18560],
    [280, 4, 20300],
    [300, 4, 21500],
    [301, 4, 31060], // overnight: 2 driver days + 1 night
    [320, 4, 32200],
    [960, 4, 80100],
  ])('%s km round trip → band %s, KES %s', (km, band, total) => {
    const t = computeTravel(km, cfg)
    expect(t.band).toBe(band)
    expect(t.total).toBe(total)
  })

  it('itemises each component', () => {
    expect(lines(40)).toEqual({ Fuel: 1000 })
    expect(lines(80)).toEqual({ Fuel: 2000, 'Vehicle wear & tear': 2000 })
    expect(lines(180)).toEqual({ Fuel: 4500, 'Vehicle wear & tear': 4500, 'Operational contingency': 1800 })
    expect(lines(280)).toEqual({ Fuel: 7000, 'Vehicle wear & tear': 7000, 'Operational contingency': 2800, 'Driver allowance': 3500 })
    expect(lines(320)).toEqual({ Fuel: 8000, 'Vehicle wear & tear': 8000, 'Operational contingency': 3200, 'Driver allowance': 7000, Accommodation: 6000 })
    // Nairobi–Mombasa and back: two nights, three driver days
    expect(lines(960)).toEqual({ Fuel: 24000, 'Vehicle wear & tear': 24000, 'Operational contingency': 9600, 'Driver allowance': 10500, Accommodation: 12000 })
  })

  it('adds base mobilization when configured', () => {
    const c = { ...cfg, travel: { ...cfg.travel, baseMobilization: 2000 } }
    expect(computeTravel(40, c).total).toBe(3000)
  })

  it('rejects negative or invalid distances', () => {
    expect(() => computeTravel(-1, cfg)).toThrow(PricingError)
    expect(() => computeTravel(Number.NaN, cfg)).toThrow(PricingError)
  })
})

describe('complexity scoring', () => {
  it.each([
    [5, 'basic'], [6, 'basic'], [7, 'basic'],
    [8, 'standard'], [9, 'standard'], [10, 'standard'], [11, 'standard'],
    [12, 'comprehensive'], [13, 'comprehensive'], [14, 'comprehensive'], [15, 'comprehensive'],
  ])('score %s → %s', (score, tier) => {
    expect(tierFor(score, cfg).code).toBe(tier)
  })

  it('sums five answers of 1–3', () => {
    expect(complexityScore([1, 1, 1, 1, 1])).toBe(5)
    expect(complexityScore([3, 3, 3, 3, 3])).toBe(15)
    expect(complexityScore([1, 2, 3, 2, 1])).toBe(9)
  })

  it('rejects missing or out-of-range answers', () => {
    expect(() => complexityScore([1, 1, 1, 1])).toThrow(PricingError)
    expect(() => complexityScore([0, 1, 1, 1, 1])).toThrow(PricingError)
    expect(() => complexityScore([1, 1, 1, 1, 4])).toThrow(PricingError)
    expect(() => complexityScore([1, 1, 1, 1, 1.5])).toThrow(PricingError)
  })
})

describe('full quote', () => {
  it('Due Diligence, standard complexity, 180 km, drone, priority', () => {
    const q = computeQuote(
      { serviceCode: 'due_diligence', roundTripKm: 180, answers: [2, 2, 2, 2, 2], addonCodes: ['drone'], urgencyCode: 'priority' },
      cfg,
    )
    expect(q.complexity).toMatchObject({ score: 10, tier: 'standard', multiplier: 1.3, adjustedFee: 45500, adjustment: 10500 })
    expect(q.travel.total).toBe(10800)
    expect(q.addonsTotal).toBe(35000)
    expect(q.subtotal).toBe(91300)
    expect(q.urgency.amount).toBe(22825)
    expect(q.total).toBe(114125)
    expect(q.totalMax).toBeUndefined()
  })

  it('Ground Verification, basic, 40 km, standard speed', () => {
    const q = computeQuote({ serviceCode: 'ground_verification', roundTripKm: 40, answers: [1, 1, 1, 1, 1], addonCodes: [], urgencyCode: 'standard' }, cfg)
    expect(q.total).toBe(16000)
  })

  it('Feasibility, comprehensive, Mombasa round trip, all add-ons, express', () => {
    const q = computeQuote(
      { serviceCode: 'feasibility', roundTripKm: 960, answers: [3, 3, 3, 3, 3], addonCodes: ['drone', 'exec_deck', 'recurring_setup'], urgencyCode: 'express' },
      cfg,
    )
    // 50,000 × 1.7 = 85,000; travel 80,100; add-ons 75,000 → 240,100; +50% = 120,050
    expect(q.subtotal).toBe(240100)
    expect(q.total).toBe(360150)
  })

  it('Emergency gives a 75–100% range', () => {
    const q = computeQuote({ serviceCode: 'ground_verification', roundTripKm: 40, answers: [1, 1, 1, 1, 1], addonCodes: [], urgencyCode: 'emergency' }, cfg)
    expect(q.total).toBe(28000)
    expect(q.totalMax).toBe(32000)
  })

  it('ignores duplicate add-ons', () => {
    const q = computeQuote({ serviceCode: 'ground_verification', roundTripKm: 0, answers: [1, 1, 1, 1, 1], addonCodes: ['drone', 'drone'], urgencyCode: 'standard' }, cfg)
    expect(q.addonsTotal).toBe(35000)
  })

  it('rejects unknown or inactive choices', () => {
    const base = { serviceCode: 'ground_verification', roundTripKm: 40, answers: [1, 1, 1, 1, 1] as [number, number, number, number, number], addonCodes: [] as string[], urgencyCode: 'standard' }
    expect(() => computeQuote({ ...base, serviceCode: 'nope' }, cfg)).toThrow(PricingError)
    expect(() => computeQuote({ ...base, addonCodes: ['nope'] }, cfg)).toThrow(PricingError)
    expect(() => computeQuote({ ...base, urgencyCode: 'nope' }, cfg)).toThrow(PricingError)
    const inactive = { ...cfg, services: cfg.services.map((s) => (s.code === 'ground_verification' ? { ...s, active: false } : s)) }
    expect(() => computeQuote(base, inactive)).toThrow(PricingError)
  })
})

describe('configuration', () => {
  it('default configuration is valid', () => {
    expect(pricingConfigSchema.safeParse(cfg).success).toBe(true)
    expect(configProblems(cfg)).toEqual([])
  })

  it('flags gaps between complexity tiers', () => {
    const bad = { ...cfg, complexity: cfg.complexity.map((t) => (t.code === 'standard' ? { ...t, minScore: 9 } : t)) }
    expect(configProblems(bad).length).toBeGreaterThan(0)
  })

  it('flags an emergency range that is upside down', () => {
    const bad = { ...cfg, urgency: cfg.urgency.map((u) => (u.code === 'emergency' ? { ...u, pct: 100, pctMax: 75 } : u)) }
    expect(configProblems(bad)).toContain('Emergency: maximum surcharge is below the minimum.')
  })
})
