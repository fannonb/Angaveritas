import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import localFont from 'next/font/local'
import '@/site/site.css'
import './globals.css'

const neueMontreal = localFont({
  src: [
    {
      path: '../fonts/PPNeueMontreal-Thin.woff',
      weight: '100',
      style: 'normal',
    },
    {
      path: '../fonts/PPNeueMontreal-Book.woff',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../fonts/PPNeueMontreal-Italic.woff',
      weight: '400',
      style: 'italic',
    },
    {
      path: '../fonts/PPNeueMontreal-Medium.woff',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../fonts/PPNeueMontreal-Medium.woff',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../fonts/PPNeueMontreal-Bold.woff',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-neue-montreal',
  display: 'swap',
})

const plex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-plex', display: 'swap' })
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex-mono', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'https://angaveritas.com'),
  title: { default: 'AngaVeritas | Ground verification and due diligence in Kenya', template: '%s | AngaVeritas' },
  description:
    'We visit the site, check the people and the paperwork, and send you a report with photos, GPS evidence and a clear recommendation. For investors in Kenya and abroad.',
  icons: { icon: '/favicon.svg' },
  openGraph: { type: 'website', siteName: 'AngaVeritas', images: ['/images/og-image.jpg'] },
}

export const viewport: Viewport = { themeColor: '#ffffff' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${neueMontreal.variable} ${plex.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
