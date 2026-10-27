// Applies SQL files in supabase/migrations in order, once each.
// Usage: npm run db:migrate
import fs from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'

// Local development reads .env.local; in production the variables are set by the host.
try { process.loadEnvFile('.env.local') } catch {}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} })
const dir = path.resolve('supabase/migrations')

try {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`
  await sql`alter table schema_migrations enable row level security`
  const done = new Set((await sql`select name from schema_migrations`).map((r) => r.name))
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    if (done.has(file)) continue
    const text = fs.readFileSync(path.join(dir, file), 'utf8')
    await sql.begin(async (tx) => {
      await tx.unsafe(text)
      await tx`insert into schema_migrations (name) values (${file})`
    })
    console.log('applied', file)
  }
  console.log('database is up to date')
} catch (err) {
  console.error('migration failed:', err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
