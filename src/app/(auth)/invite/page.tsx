import type { Metadata } from 'next'
import Link from 'next/link'
import { peekToken } from '@/lib/auth/tokens'
import { SetPasswordForm } from '../forms'

export const metadata: Metadata = { title: 'Join the AngaVeritas team', robots: { index: false } }
export const dynamic = 'force-dynamic'

export default async function InvitePage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ token?: string }> }) {
  const searchParams = await searchParamsPromise
  const valid = searchParams.token ? await peekToken(searchParams.token, 'invite') : null
  return (
    <div className="panel panel-pad space-y-5">
      <h1 className="app-title">Welcome to AngaVeritas</h1>
      {valid ? (
        <>
          <p className="text-ink-2">Hello {valid.full_name}. Choose a password for {valid.email} to finish setting up your staff account.</p>
          <SetPasswordForm token={searchParams.token!} purpose="invite" />
        </>
      ) : (
        <>
          <p className="alert alert-warn">This invitation has expired or was already used. Ask an admin to send a new one.</p>
          <Link className="btn btn-secondary" href="/login">Go to sign in</Link>
        </>
      )}
    </div>
  )
}
