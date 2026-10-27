import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser, homeFor } from '@/lib/auth/session'
import { LoginForm } from '../forms'

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } }

export default async function LoginPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ next?: string; signed_out?: string; verified?: string }> }) {
  const searchParams = await searchParamsPromise
  const user = await getUser()
  if (user) redirect(homeFor(user))
  return (
    <div className="panel panel-pad space-y-5">
      <div>
        <h1 className="app-title">Sign in</h1>
        <p className="mt-1 text-ink-2">Clients and AngaVeritas staff sign in here.</p>
      </div>
      {searchParams.signed_out && <p className="alert alert-ok">You have signed out.</p>}
      {searchParams.verified && <p className="alert alert-ok">Email confirmed. Please sign in.</p>}
      <LoginForm next={searchParams.next} />
      <p className="border-0 border-t border-solid border-line pt-4 text-sm text-ink-2">
        New to AngaVeritas? <Link href={`/register${searchParams.next ? `?next=${encodeURIComponent(searchParams.next)}` : ''}`}>Create an account</Link> or{' '}
        <Link href="/estimate">start with an estimate</Link>.
      </p>
    </div>
  )
}
