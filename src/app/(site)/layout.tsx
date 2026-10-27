import { Footer, WhatsAppButton } from '@/components/site/Footer'
import { ActionBar, Header } from '@/components/site/Header'

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <Header />
      <div id="main" tabIndex={-1}>{children}</div>
      <Footer />
      <ActionBar />
      <WhatsAppButton />
    </>
  )
}
