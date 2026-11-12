import type { Metadata } from 'next'
import Link from 'next/link'
import { staffMfaSetup } from '@/lib/auth/mfa'
import { pendingStaffSignIn } from '@/lib/auth/session'
import { StaffSecurityForm } from '../forms'

export const metadata: Metadata = { title: 'Staff authentication', robots: { index: false }, referrer: 'no-referrer' }
export const dynamic = 'force-dynamic'

export default async function StaffSecurityPage({ searchParams }: { searchParams: Promise<{ token?: string; next?: string }> }) {
  const { token, next } = await searchParams
  const setup = token ? await staffMfaSetup(token) : null
  const pending = !token && await pendingStaffSignIn()
  return (
    <div className="panel panel-pad space-y-4">
      <h1 className="app-title">{setup ? 'Set up your authenticator' : 'Staff sign-in'}</h1>
      {setup && token ? (
        <>
          <p className="text-ink-2">Add a time-based account for {setup.email} in your authenticator app using this setup key.</p>
          <code className="block break-all rounded bg-paper p-3 select-all">{setup.secret}</code>
          <StaffSecurityForm token={token} />
        </>
      ) : pending ? (
        <>
          <p className="text-ink-2">Enter the current six-digit code from your authenticator app.</p>
          <StaffSecurityForm next={next} />
        </>
      ) : <p className="alert alert-warn">This sign-in or setup link has expired.</p>}
      <Link className="linkish text-sm" href="/login">Back to sign in</Link>
    </div>
  )
}
