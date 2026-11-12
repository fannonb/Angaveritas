import type { Metadata } from 'next'
import Link from 'next/link'
import { peekToken } from '@/lib/auth/tokens'
import { SetPasswordForm } from '../forms'

export const metadata: Metadata = { title: 'Confirm your email', robots: { index: false }, referrer: 'no-referrer' }
export const dynamic = 'force-dynamic'

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string; next?: string }> }) {
  const { token, next } = await searchParams
  const pending = token ? await peekToken(token, 'verify_email') : null
  return (
    <div className="panel panel-pad space-y-4">
      <h1 className="app-title">Confirm your email</h1>
      {pending && token ? (
        <>
          <p className="text-ink-2">Choose a password for {pending.email} to finish creating your account.</p>
          <SetPasswordForm token={token} purpose="verify_email" next={next} />
        </>
      ) : (
        <>
          <p className="alert alert-warn">This link has expired or was already used.</p>
          <Link className="btn btn-primary" href="/register">Request a new link</Link>
        </>
      )}
    </div>
  )
}
