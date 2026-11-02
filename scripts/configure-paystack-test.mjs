// Configure local sandbox payments without displaying credentials or sending email.
import fs from 'node:fs'
import postgres from 'postgres'

try { process.loadEnvFile('.env.local') } catch {}
if (!process.env.DATABASE_URL) throw new Error('Configure the local database first.')
const url=new URL(process.env.DATABASE_URL)
if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('This setup script only configures a local test database.')
if (process.env.PAYSTACK_SECRET_KEY && !process.env.PAYSTACK_SECRET_KEY.startsWith('sk_test_'))
  throw new Error('Remove the non-test Paystack key from this local environment before configuring sandbox payments.')

const db=postgres(url.toString(),{max:1,prepare:false,onnotice(){}})
try {
  const [migration]=await db`select name from schema_migrations where name='0022_paystack.sql'`
  if (!migration) throw new Error('Apply the payment migration with npm run db:migrate first.')
  const email='paystack-test@angaveritas.invalid'
  const actor=await db.begin(async tx => {
    const [existing]=await tx`select id,role,disabled_at from users where email=${email}`
    if (existing) {
      if (existing.role!=='admin' || existing.disabled_at) throw new Error('The existing test service account needs administrator review.')
      return existing.id
    }
    // Reserved .invalid address, no password, invitation or session. Local test use only.
    const [created]=await tx`insert into users(email,full_name,role,email_updates,country_code,region_code)
      values (${email},'Paystack Test Service','admin',false,'KE','30') returning id`
    return created.id
  })
  let contents=fs.existsSync('.env.local') ? fs.readFileSync('.env.local','utf8') : ''
  const settings={PAYSTACK_ENABLED:'true',PAYSTACK_MODE:'test',PAYSTACK_ACTOR_ID:actor,PAYSTACK_CHANNELS:'card,mobile_money'}
  for (const [name,value] of Object.entries(settings)) {
    const pattern=new RegExp(`^${name}=.*$`,'gm')
    if (pattern.test(contents)) contents=contents.replace(pattern,`${name}=${value}`)
    else contents+=`${contents.endsWith('\n') ? '' : '\n'}${name}=${value}\n`
  }
  if (!/^PAYSTACK_SECRET_KEY=/m.test(contents)) contents+='PAYSTACK_SECRET_KEY=\n'
  fs.writeFileSync('.env.local',contents)
  console.log('Local Paystack test mode, payment methods and audit account configured.')
  console.log(process.env.PAYSTACK_SECRET_KEY ? 'Test key is present. Restart the app before testing.' : 'Next: add your sk_test_ secret to PAYSTACK_SECRET_KEY in .env.local, then restart the app. The key is never printed.')
} finally {await db.end()}
