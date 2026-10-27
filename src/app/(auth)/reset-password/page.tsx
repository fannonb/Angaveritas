import type { Metadata } from 'next'
import Link from 'next/link'
import { peekToken } from '@/lib/auth/tokens'
import { SetPasswordForm } from '../forms'

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false } }
export const dynamic = 'force-dynamic'

export default async function ResetPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ token?: string }> }) {
  const searchParams = await searchParamsPromise
  const valid = searchParams.token ? await peekToken(searchParams.token, 'reset_password') : null
  return (
    <div className="panel panel-pad space-y-5">
      <h1 className="app-title">Choose a new password</h1>
      {valid ? (
        <>
          <p className="text-ink-2">For {valid.email}. You will be signed out on other devices.</p>
          <SetPasswordForm token={searchParams.token!} purpose="reset_password" />
        </>
      ) : (
        <>
          <p className="alert alert-warn">This link has expired or was already used. Reset links work once, for one hour.</p>
          <Link className="btn btn-primary" href="/forgot-password">Send a new link</Link>
        </>
      )}
    </div>
  )
}
