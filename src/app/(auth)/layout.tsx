import Link from 'next/link'
import { AppIcon } from '@/components/app/icons'
import { site } from '@/lib/site'

const points = [
  { icon: 'pin', title: 'Evidence from the site', text: 'Photos and video with GPS and capture time, each file fingerprinted.' },
  { icon: 'review', title: 'Independent review', text: 'A second person checks every visit and report before you see it.' },
  { icon: 'clock', title: 'Every step in one place', text: 'Proposal, visit, findings and report, from enquiry to delivery.' },
]

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-ui min-h-screen bg-[#f5f5f3] text-ink antialiased">
      <div className="mx-auto grid min-h-screen max-w-[1440px] gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-6 xl:gap-8">
        <aside className="panel hidden flex-col justify-between border border-line bg-white p-8 shadow-sm lg:flex lg:sticky lg:top-5 lg:self-start lg:h-[calc(100vh-2.5rem)] lg:overflow-y-auto xl:p-12">
          <div className="flex flex-col items-center text-center pt-1">
            <Link href="/" aria-label="AngaVeritas home" className="inline-block transition-transform hover:scale-[1.01]">
              <img
                src="/images/logo.webp"
                alt="AngaVeritas"
                width="640"
                height="227"
                className="block h-[97px] w-auto max-w-full mix-blend-multiply"
              />
            </Link>
            <span className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-[0.72rem] font-semibold tracking-wider uppercase text-gold-text bg-[#fcf9f2] border border-[#ebd9b8]">
              Ground Verification &amp; Due Diligence
            </span>
          </div>
          <div className="mx-auto my-auto w-full max-w-md py-6">
            <p className="text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.02em]">Intelligence that protects investments.</p>
            <ul className="mt-8 space-y-5">
              {points.map((p) => (
                <li key={p.title} className="flex gap-4">
                  <span className="tile"><AppIcon name={p.icon} /></span>
                  <span>
                    <strong className="block text-[0.9rem] font-semibold">{p.title}</strong>
                    <span className="text-sm text-muted">{p.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-center text-sm text-muted">Ground verification and due diligence in Kenya.</p>
        </aside>

        <div className="flex flex-col min-h-full justify-between">
          <header className="flex items-center justify-between px-2 py-3 sm:px-4">
            <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase text-ink-2 no-underline hover:text-ink">
              ← Back to website
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[0.72rem] font-medium text-muted shadow-xs">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              Secure Portal
            </span>
          </header>
          <main className="flex flex-1 items-center justify-center px-1 py-4 sm:px-4">
            <div className="w-full max-w-[30rem]">
              <div className="mb-5 flex flex-col items-center text-center lg:hidden">
                <div className="w-full flex flex-col items-center rounded-2xl border border-line bg-white px-5 py-4 shadow-xs">
                  <Link href="/" aria-label="AngaVeritas home" className="inline-block transition-transform active:scale-[0.98]">
                    <img
                      src="/images/logo.webp"
                      alt="AngaVeritas"
                      width="640"
                      height="227"
                      className="block h-[74px] sm:h-[80px] w-auto max-w-full mix-blend-multiply"
                    />
                  </Link>
                  <span className="mt-2 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[0.68rem] font-semibold tracking-wider uppercase text-gold-text bg-[#fcf9f2] border border-[#ebd9b8]">
                    Ground Verification &amp; Due Diligence
                  </span>
                </div>
              </div>
              {children}
            </div>
          </main>
          <footer className="py-6 text-center text-xs text-muted">
            Need help? <a href={`mailto:${site.email}`} className="text-ink-2 underline underline-offset-2">{site.email}</a> · <Link href="/privacy" className="hover:underline">Privacy</Link> · <Link href="/terms" className="hover:underline">Terms</Link>
          </footer>
        </div>
      </div>
    </div>
  )
}
