import Link from 'next/link'
import { site } from '@/lib/site'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-ui min-h-screen bg-[#f5f5f3] text-ink antialiased">
      <div className="mx-auto grid min-h-screen max-w-[1440px] gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-6 xl:gap-8">
        <aside className="panel hidden flex-col items-center justify-center border border-line bg-white p-8 text-center shadow-sm lg:flex lg:sticky lg:top-5 lg:self-start lg:h-[calc(100vh-2.5rem)] xl:p-12">
          <Link href="/" aria-label="AngaVeritas home" className="inline-block">
            <img
              src="/images/logo.webp"
              alt="AngaVeritas"
              width="640"
              height="227"
              className="block h-[110px] w-auto max-w-full mix-blend-multiply"
            />
          </Link>
        </aside>

        <div className="flex flex-col min-h-full justify-between">
          <header className="px-2 py-3 sm:px-4">
            <Link href="/" className="text-sm text-ink-2 no-underline hover:text-ink">← Back to website</Link>
          </header>
          <main className="flex flex-1 items-center justify-center px-1 py-4 sm:px-4">
            <div className="w-full max-w-[26rem]">
              <Link href="/" aria-label="AngaVeritas home" className="mb-6 flex justify-center lg:hidden">
                <img
                  src="/images/logo.webp"
                  alt="AngaVeritas"
                  width="640"
                  height="227"
                  className="block h-[72px] w-auto max-w-full mix-blend-multiply"
                />
              </Link>
              {children}
            </div>
          </main>
          <footer className="py-6 text-center text-xs text-muted">
            <a href={`mailto:${site.email}`} className="hover:underline">{site.email}</a> · <Link href="/privacy" className="hover:underline">Privacy</Link> · <Link href="/terms" className="hover:underline">Terms</Link>
          </footer>
        </div>
      </div>
    </div>
  )
}
