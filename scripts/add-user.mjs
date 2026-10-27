// Creates a staff account (the first admin, or anyone else) and prints a
// one-time link to set the password. Afterwards, invite people from /staff/team.
// Usage: npm run user:add -- name@angaveritas.com "Full Name" admin|analyst|field_agent
import crypto from 'node:crypto'
import postgres from 'postgres'

try { process.loadEnvFile('.env.local') } catch {}

const [email, name, role = 'admin'] = process.argv.slice(2)
if (!email || !name || !['admin', 'analyst', 'field_agent'].includes(role)) {
  console.error('Usage: npm run user:add -- email "Full Name" admin|analyst|field_agent')
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, onnotice: () => {} })
try {
  const lower = email.trim().toLowerCase()
  const [existing] = await sql`select id, role from users where email = ${lower}`
  if (existing && existing.role === 'client') throw new Error('That email belongs to a client account.')
  const [user] = existing
    ? await sql`update users set role = ${role}, full_name = ${name}, disabled_at = null where id = ${existing.id} returning id`
    : await sql`insert into users (email, full_name, role) values (${lower}, ${name}, ${role}) returning id`
  const token = crypto.randomBytes(32).toString('base64url')
  await sql`update user_tokens set used_at = now() where user_id = ${user.id} and purpose = 'invite' and used_at is null`
  await sql`
    insert into user_tokens (id, user_id, purpose, expires_at)
    values (${crypto.createHash('sha256').update(token).digest('hex')}, ${user.id}, 'invite', now() + interval '7 days')`
  const app = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  console.log(`${existing ? 'Updated' : 'Created'} ${role} ${lower}.`)
  console.log(`Set the password (link works once, for 7 days):\n${app}/invite?token=${token}`)
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
