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
      <h1 className="app-title">Sign in</h1>
      {searchParams.signed_out && <p className="alert alert-ok">You have signed out.</p>}
      {searchParams.verified && <p className="alert alert-ok">Email confirmed. Please sign in.</p>}
      <LoginForm next={searchParams.next} />
      <p className="text-center text-sm text-ink-2">
        New here? <Link href={`/register${searchParams.next ? `?next=${encodeURIComponent(searchParams.next)}` : ''}`}>Create an account</Link>
      </p>
    </div>
  )
}
