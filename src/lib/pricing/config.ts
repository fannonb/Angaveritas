import { z } from 'zod'

// Pricing configuration. Every number here is editable in /admin/pricing;
// each save creates a new version so old quotes keep the rates they used.
// Defaults come from the Technical Implementation Document §4 and the
// Pricing Calculator Costing Logic document.

export const pricingConfigSchema = z.object({
  multiSiteFee: z.number().int().min(0).max(1000000).default(0),
  origin: z.object({
    label: z.string().min(1),
    lat: z.number().min(-5).max(5.5),
    lng: z.number().min(33.5).max(42.5),
  }),
  services: z
    .array(
      z.object({
        code: z.string().regex(/^[a-z_]+$/),
        name: z.string().min(1),
        baseFee: z.number().int().min(0),
        active: z.boolean(),
      }),
    )
    .min(1),
  travel: z.object({
    baseMobilization: z.number().int().min(0),
    fuelPerKm: z.number().min(0),
    wearPerKm: z.number().min(0),
    wearFromKm: z.number().min(0),
    contingencyPct: z.number().min(0).max(100),
    contingencyFromKm: z.number().min(0),
    driverPerDay: z.number().int().min(0),
    driverFromKm: z.number().min(0),
    accommodationPerNight: z.number().int().min(0),
    accommodationFromKm: z.number().min(0),
    kmPerNight: z.number().min(50),
  }),
  complexity: z
    .array(
      z.object({
        code: z.enum(['basic', 'standard', 'comprehensive']),
        name: z.string().min(1),
        minScore: z.number().int().min(5).max(15),
        maxScore: z.number().int().min(5).max(15),
        multiplier: z.number().min(0.5).max(5),
      }),
    )
    .length(3),
  addons: z.array(
    z.object({
      code: z.string().regex(/^[a-z_]+$/),
      name: z.string().min(1),
      price: z.number().int().min(0),
      unit: z.string().optional(),
      active: z.boolean(),
    }),
  ),
  urgency: z
    .array(
      z.object({
        code: z.enum(['standard', 'priority', 'express', 'emergency']),
        name: z.string().min(1),
        delivery: z.string().min(1),
        pct: z.number().min(0).max(200),
        pctMax: z.number().min(0).max(200).optional(),
        active: z.boolean(),
      }),
    )
    .min(1),
})

export type PricingConfig = z.infer<typeof pricingConfigSchema>

export const defaultPricingConfig: PricingConfig = {
  multiSiteFee: 0, // No approved rate supplied: multi-site fees remain TBC until configured.
  origin: { label: 'Nairobi CBD', lat: -1.2864, lng: 36.8172 },
  services: [
    { code: 'ground_verification', name: 'Ground Verification', baseFee: 15000, active: true },
    { code: 'supplier_verification', name: 'Supplier & Contractor Verification', baseFee: 18000, active: true },
    { code: 'project_monitoring', name: 'Project Monitoring', baseFee: 25000, active: true },
    { code: 'due_diligence', name: 'Business Due Diligence', baseFee: 35000, active: true },
    { code: 'feasibility', name: 'Feasibility & Market Study', baseFee: 50000, active: true },
  ],
  travel: {
    baseMobilization: 0,
    fuelPerKm: 25,
    wearPerKm: 25,
    wearFromKm: 50,
    contingencyPct: 20,
    contingencyFromKm: 100,
    driverPerDay: 3500,
    driverFromKm: 250,
    accommodationPerNight: 6000,
    accommodationFromKm: 300,
    kmPerNight: 600,
  },
  complexity: [
    { code: 'basic', name: 'Basic', minScore: 5, maxScore: 7, multiplier: 1.0 },
    { code: 'standard', name: 'Standard', minScore: 8, maxScore: 11, multiplier: 1.3 },
    { code: 'comprehensive', name: 'Comprehensive', minScore: 12, maxScore: 15, multiplier: 1.7 },
  ],
  addons: [
    { code: 'drone', name: 'Drone survey & aerial imagery', price: 35000, active: true },
    { code: 'exec_deck', name: 'Executive investor presentation', price: 15000, active: true },
    { code: 'recurring_setup', name: 'Ongoing monitoring setup', price: 25000, unit: 'per cycle', active: true },
  ],
  urgency: [
    { code: 'standard', name: 'Standard', delivery: '5–10 business days', pct: 0, active: true },
    { code: 'priority', name: 'Priority', delivery: '2–5 business days', pct: 25, active: true },
    { code: 'express', name: 'Express', delivery: '24–48 hours', pct: 50, active: true },
    { code: 'emergency', name: 'Emergency', delivery: 'Same day / within 24 hours', pct: 75, pctMax: 100, active: true },
  ],
}

/** Extra checks the schema alone can't express. Returns a list of problems. */
export function configProblems(cfg: PricingConfig): string[] {
  const problems: string[] = []
  const tiers = [...cfg.complexity].sort((a, b) => a.minScore - b.minScore)
  if (tiers[0].minScore !== 5) problems.push('The lowest complexity tier must start at score 5.')
  if (tiers[2].maxScore !== 15) problems.push('The highest complexity tier must end at score 15.')
  for (let i = 0; i < tiers.length; i++) {
    if (tiers[i].minScore > tiers[i].maxScore) problems.push(`${tiers[i].name}: minimum score is above maximum.`)
    if (i > 0 && tiers[i].minScore !== tiers[i - 1].maxScore + 1)
      problems.push(`Complexity tiers must follow on without gaps or overlaps (${tiers[i - 1].name} → ${tiers[i].name}).`)
  }
  for (const u of cfg.urgency) {
    if (u.pctMax !== undefined && u.pctMax < u.pct) problems.push(`${u.name}: maximum surcharge is below the minimum.`)
  }
  const codes = new Set<string>()
  for (const s of cfg.services) {
    if (codes.has(s.code)) problems.push(`Duplicate service code "${s.code}".`)
    codes.add(s.code)
  }
  if (!cfg.services.some((s) => s.active)) problems.push('At least one service must be active.')
  if (!cfg.urgency.some((u) => u.active && u.code === 'standard')) problems.push('Standard delivery must stay active.')
  return problems
}
