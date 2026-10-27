import 'server-only'
import { sql } from '@/lib/db'
import { defaultPricingConfig, pricingConfigSchema, type PricingConfig } from '@/lib/pricing/config'

export type PricingVersion = { id: number | null; config: PricingConfig; note: string | null; createdBy: string | null; createdAt: Date | null }

/** The newest saved pricing, or the built-in defaults if none saved yet. */
export async function getActivePricing(): Promise<PricingVersion> {
  const [row] = await sql`
    select p.id, p.config, p.note, u.full_name as created_by, p.created_at
    from pricing_versions p left join users u on u.id = p.created_by
    order by p.id desc limit 1`
  if (!row) return { id: null, config: defaultPricingConfig, note: 'Built-in defaults', createdBy: null, createdAt: null }
  const parsed = pricingConfigSchema.safeParse(row.config)
  // A stored config that no longer matches the schema should never break quoting.
  if (!parsed.success) return { id: null, config: defaultPricingConfig, note: 'Built-in defaults (stored version invalid)', createdBy: null, createdAt: null }
  return { id: Number(row.id), config: parsed.data, note: row.note, createdBy: row.created_by, createdAt: row.created_at }
}

export async function savePricingVersion(config: PricingConfig, note: string | null, actorId: string) {
  const [row] = await sql`
    insert into pricing_versions (config, note, created_by)
    values (${sql.json(config as never)}, ${note}, ${actorId}) returning id`
  return Number(row.id)
}

export async function listPricingVersions(limit = 20) {
  return sql<{ id: number; note: string | null; created_by: string | null; created_at: Date }[]>`
    select p.id, p.note, u.full_name as created_by, p.created_at
    from pricing_versions p left join users u on u.id = p.created_by
    order by p.id desc limit ${limit}`
}

export async function getPricingVersion(id: number) {
  const [row] = await sql`select id, config from pricing_versions where id = ${id}`
  return row ? { id: Number(row.id), config: row.config as PricingConfig } : null
}
