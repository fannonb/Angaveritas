import 'server-only'
import postgres from 'postgres'
import { calendarDateType } from './database-types'

// One small pool per server instance. `prepare: false` is required for
// Supabase's transaction pooler (port 6543) and harmless elsewhere.
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> }
const databaseUrl = process.env.DATABASE_URL ?? ''
const databaseHost = databaseUrl ? new URL(databaseUrl).hostname : 'localhost'
const remoteDatabase = !['localhost', '127.0.0.1', '[::1]', ''].includes(databaseHost)
const databaseCa = process.env.DATABASE_CA_CERT?.replace(/\\n/g, '\n')

export const sql =
  globalForDb.sql ??
  postgres(databaseUrl, {
    ...(remoteDatabase ? { ssl: { rejectUnauthorized: true, ...(databaseCa ? { ca: databaseCa } : {}) } } : {}),
    prepare: false,
    max: Number(process.env.DB_POOL_MAX ?? 3),
    // On Vercel a suspended function can wake holding sockets the pooler has already closed,
    // so idle connections are dropped almost at once there; locally they are kept for reuse.
    idle_timeout: process.env.VERCEL ? 1 : 20,
    connect_timeout: 10,
    onnotice: () => {},
    types: { calendarDate: calendarDateType },
  })

if (process.env.NODE_ENV !== 'production') globalForDb.sql = sql

/** Attribute database-triggered audit entries in the same transaction as the change. */
export async function withActor<T>(actorId: string, work: (tx: postgres.TransactionSql) => Promise<T>, ipHash?: string) {
  return sql.begin(async tx => {
    await tx`select set_config('app.actor_id', ${actorId}, true), set_config('app.ip_hash', ${ipHash ?? ''}, true)`
    return work(tx)
  }) as Promise<T>
}
