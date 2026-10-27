import type { Metadata } from 'next'
import { AppIcon } from '@/components/app/icons'
import Calculator from '@/components/calculator/Calculator'
import { getUser, isStaff } from '@/lib/auth/session'
import { sql } from '@/lib/db'
import { getActivePricing } from '@/lib/data/pricing'
import { site } from '@/lib/site'
import { services } from '@/site/services'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Get an estimate',
  description: 'Get an itemised estimate for ground verification, due diligence or project monitoring anywhere in Kenya, including travel from Nairobi.',
}

export default async function EstimatePage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ service?: string; project?: string }> }) {
  const searchParams = await searchParamsPromise
  const [{ config }, user] = await Promise.all([getActivePricing(), getUser()])

  // ?service= accepts a website slug or a calculator code.
  const wanted = services.find((s) => s.slug === searchParams.service)?.calculatorCode ?? searchParams.service
  const initialService = config.services.some((s) => s.active && s.code === wanted) ? wanted! : null

  // ?project=AVP-123: a follow-up inspection on the client's own project.
  let parentProject = null
  if (user && !isStaff(user) && searchParams.project && /^AVP-\d+$/.test(searchParams.project)) {
    const [p] = await sql<{ code: string; title: string; location_label: string | null; location_lat: number | null; location_lng: number | null }[]>`
      select code, title, location_label, location_lat, location_lng from projects where code = ${searchParams.project} and client_id = ${user.id}`
    if (p) {
      parentProject = {
        code: p.code,
        title: p.title,
        location: p.location_label && p.location_lat != null && p.location_lng != null ? { label: p.location_label, lat: p.location_lat, lng: p.location_lng } : null,
      }
    }
  }

  const promises = [
    'See the price before giving any details',
    'Travel from Nairobi priced line by line',
    'Final scope and price agreed in a proposal',
  ]

  return (
    <main className="app-ui est-page">
      <div className="wrap">
        <header className="est-head">
          <div className="max-w-2xl">
            <p className="est-eyebrow">{parentProject ? 'Follow-up' : 'Instant estimate'}</p>
            <h1 className="app-title">{parentProject ? 'Request a follow-up inspection' : 'Get an estimate'}</h1>
            <p className="est-lead">
              Six short steps give you an itemised price. To send it, you create a free account, which is where your proposal,
              evidence and reports will live.
            </p>
          </div>
          <ul className="est-promises">
            {promises.map((t) => <li key={t}><AppIcon name="check" />{t}</li>)}
          </ul>
        </header>
        {user && isStaff(user) && (
          <p className="alert alert-warn mb-5">You are signed in as staff. You can try the calculator, but requests must come from a client account.</p>
        )}
        <Calculator
          config={config}
          usdRate={site.usdRate}
          signedInAs={user && !isStaff(user) ? { name: user.full_name, email: user.email } : null}
          initialService={parentProject ? 'project_monitoring' : initialService}
          parentProject={parentProject}
        />
      </div>
    </main>
  )
}
