import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser, homeFor } from '@/lib/auth/session'
import { RegisterForm } from '../forms'

export const metadata: Metadata = { title: 'Create an account', robots: { index: false } }

export default async function RegisterPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ next?: string }> }) {
  const searchParams = await searchParamsPromise
  const user = await getUser()
  if (user) redirect(homeFor(user))
  return (
    <div className="panel panel-pad space-y-5">
      <div>
        <h1 className="app-title">Create your account</h1>
        <p className="mt-1 text-ink-2">
          Your private dashboard for requests, proposals, site evidence and reports. Free, and nothing is charged until you accept a proposal.
        </p>
      </div>
      <RegisterForm next={searchParams.next} />
      <p className="border-0 border-t border-solid border-line pt-4 text-sm text-ink-2">
        Already registered? <Link href="/login">Sign in</Link>
      </p>
    </div>
  )
}
