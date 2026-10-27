import type { PricingConfig } from './config'
import type { ComplexityAnswers } from './questions'

// Pricing engine. Pure functions only: no I/O, so the browser and the server
// produce identical results and every rule can be unit-tested.
//
// Formula (Technical Implementation Document §4.1):
//   Total = [ (Base × Complexity) + Travel + Add-ons ] × (1 + Urgency)
// Distances are ROUND-TRIP kilometres from the origin (Nairobi CBD).

export type Line = { label: string; amount: number; detail?: string }

export type TravelResult = {
  roundTripKm: number
  band: 1 | 2 | 3 | 4
  bandLabel: string
  lines: Line[]
  total: number
}

export type QuoteInput = {
  serviceCode: string
  roundTripKm: number
  answers: ComplexityAnswers
  addonCodes: string[]
  urgencyCode: string
  siteCount?: number
  additionalRoundTripKm?: number[]
}

export type QuoteResult = {
  service: { code: string; name: string; baseFee: number }
  complexity: { score: number; tier: string; tierName: string; multiplier: number; adjustedFee: number; adjustment: number }
  travel: TravelResult
  addons: { code: string; name: string; price: number; unit?: string }[]
  addonsTotal: number
  subtotal: number
  urgency: { code: string; name: string; delivery: string; pct: number; pctMax?: number; amount: number; amountMax?: number }
  total: number
  /** Only set when the urgency level is a range (Emergency). */
  totalMax?: number
  multiSite?: { count: number; feePerExtraSite: number; amount: number; requiresConfirmation: boolean }
}

export class PricingError extends Error {}

const roundKes = (n: number) => Math.round(n)

export function bandFor(km: number, t: PricingConfig['travel']): TravelResult['band'] {
  if (km > t.driverFromKm) return 4
  if (km > t.contingencyFromKm) return 3
  if (km > t.wearFromKm) return 2
  return 1
}

export function computeTravel(roundTripKm: number, cfg: PricingConfig): TravelResult {
  if (!Number.isFinite(roundTripKm) || roundTripKm < 0) throw new PricingError('Distance must be zero or more.')
  const t = cfg.travel
  const d = Math.round(roundTripKm * 10) / 10
  const lines: Line[] = []

  if (t.baseMobilization > 0) lines.push({ label: 'Base mobilization', amount: t.baseMobilization })

  const fuel = roundKes(d * t.fuelPerKm)
  lines.push({ label: 'Fuel', amount: fuel, detail: `${d} km × KES ${t.fuelPerKm}` })

  let wear = 0
  if (d > t.wearFromKm) {
    wear = roundKes(d * t.wearPerKm)
    lines.push({ label: 'Vehicle wear & tear', amount: wear, detail: `${d} km × KES ${t.wearPerKm}` })
  }

  if (d > t.contingencyFromKm) {
    const c = roundKes(((fuel + wear) * t.contingencyPct) / 100)
    lines.push({ label: 'Operational contingency', amount: c, detail: `${t.contingencyPct}% of fuel and wear` })
  }

  const nights = d > t.accommodationFromKm ? Math.max(1, Math.ceil(d / t.kmPerNight)) : 0
  if (d > t.driverFromKm) {
    const days = nights + 1
    lines.push({
      label: 'Driver allowance',
      amount: days * t.driverPerDay,
      detail: `${days} day${days > 1 ? 's' : ''} × KES ${t.driverPerDay.toLocaleString('en-US')}`,
    })
  }
  if (nights > 0) {
    lines.push({
      label: 'Accommodation',
      amount: nights * t.accommodationPerNight,
      detail: `${nights} night${nights > 1 ? 's' : ''} × KES ${t.accommodationPerNight.toLocaleString('en-US')}`,
    })
  }

  const band = bandFor(d, t)
  const bandLabel = [
    '',
    `Up to ${t.wearFromKm} km: fuel only`,
    `${t.wearFromKm + 1}–${t.contingencyFromKm} km: fuel and vehicle wear`,
    `${t.contingencyFromKm + 1}–${t.driverFromKm} km: fuel, wear and contingency`,
    `Over ${t.driverFromKm} km: fuel, wear, contingency and driver${t.accommodationFromKm >= t.driverFromKm ? `; accommodation over ${t.accommodationFromKm} km` : ''}`,
  ][band]

  return { roundTripKm: d, band, bandLabel, lines, total: lines.reduce((s, l) => s + l.amount, 0) }
}

export function complexityScore(answers: readonly number[]): number {
  if (answers.length !== 5 || answers.some((a) => !Number.isInteger(a) || a < 1 || a > 3))
    throw new PricingError('Each of the five complexity questions needs an answer from 1 to 3.')
  return answers.reduce((s, a) => s + a, 0)
}

export function tierFor(score: number, cfg: PricingConfig) {
  const tier = cfg.complexity.find((t) => score >= t.minScore && score <= t.maxScore)
  if (!tier) throw new PricingError(`No complexity tier covers score ${score}.`)
  return tier
}

export function computeQuote(input: QuoteInput, cfg: PricingConfig): QuoteResult {
  const service = cfg.services.find((s) => s.code === input.serviceCode && s.active)
  if (!service) throw new PricingError('Unknown or inactive service.')

  const score = complexityScore(input.answers)
  const tier = tierFor(score, cfg)
  const adjustedFee = roundKes(service.baseFee * tier.multiplier)

  const siteCount = input.siteCount ?? (input.answers[0] === 1 ? 1 : input.answers[0] === 2 ? 2 : 4)
  if (!Number.isInteger(siteCount) || siteCount < 1 || siteCount > 20) throw new PricingError('Use 1 to 20 sites; larger engagements need a custom quote.')
  const extraDistances = input.additionalRoundTripKm ?? []
  if (extraDistances.length > siteCount - 1) throw new PricingError('Too many travel legs for the stated site count.')
  const travel = computeTravel(input.roundTripKm, cfg)
  extraDistances.forEach((km,index) => {
    const extra = computeTravel(km,cfg)
    travel.roundTripKm += extra.roundTripKm
    travel.total += extra.total
    travel.lines.push(...extra.lines.map(line => ({...line,label:`Site ${index+2}: ${line.label}`})))
  })
  const multiSite = { count: siteCount, feePerExtraSite: cfg.multiSiteFee ?? 0, amount: (siteCount-1)*(cfg.multiSiteFee ?? 0), requiresConfirmation: siteCount > 1 && (!(cfg.multiSiteFee > 0) || extraDistances.length !== siteCount-1) }

  const addons = [...new Set(input.addonCodes)].map((code) => {
    const a = cfg.addons.find((x) => x.code === code && x.active)
    if (!a) throw new PricingError(`Unknown or inactive add-on "${code}".`)
    return { code: a.code, name: a.name, price: a.price, unit: a.unit }
  })
  const addonsTotal = addons.reduce((s, a) => s + a.price, 0)

  const u = cfg.urgency.find((x) => x.code === input.urgencyCode && x.active)
  if (!u) throw new PricingError('Unknown or unavailable delivery speed.')

  const subtotal = adjustedFee + travel.total + addonsTotal + multiSite.amount
  const amount = roundKes((subtotal * u.pct) / 100)
  const amountMax = u.pctMax !== undefined ? roundKes((subtotal * u.pctMax) / 100) : undefined

  return {
    service: { code: service.code, name: service.name, baseFee: service.baseFee },
    complexity: { score, tier: tier.code, tierName: tier.name, multiplier: tier.multiplier, adjustedFee, adjustment: adjustedFee - service.baseFee },
    travel,
    addons,
    addonsTotal,
    subtotal,
    urgency: { code: u.code, name: u.name, delivery: u.delivery, pct: u.pct, pctMax: u.pctMax, amount, amountMax },
    total: subtotal + amount,
    totalMax: amountMax !== undefined ? subtotal + amountMax : undefined,
    multiSite,
  }
}

export const formatKes = (n: number) => `KES ${Math.round(n).toLocaleString('en-US')}`
