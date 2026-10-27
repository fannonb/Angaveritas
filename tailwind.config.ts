import type { Config } from 'tailwindcss'

// Colour tokens read the CSS variables in src/site/site.css (the website design system), so the
// app theme (.app-ui in globals.css) can retint them for the portal and staff workspace.
// Preflight is off: site.css provides the base styles for the whole app.
export default {
  content: ['./src/**/*.{ts,tsx}'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: 'var(--ink)', 2: 'var(--ink-2)' },
        muted: 'var(--muted)',
        line: { DEFAULT: 'var(--line)', strong: 'var(--line-strong)' },
        paper: 'var(--bg-2)',
        gold: { DEFAULT: 'var(--gold)', text: 'var(--gold-text)' },
        ok: { DEFAULT: 'var(--ok)', bg: 'var(--ok-bg)' },
        warn: { DEFAULT: 'var(--warn)', bg: 'var(--warn-bg)' },
        bad: { DEFAULT: 'var(--bad)', bg: 'var(--bad-bg)' },
        brand: { DEFAULT: 'var(--brand, #17583c)', deep: 'var(--brand-deep, #0e3b28)', soft: 'var(--brand-soft, #e3f3e9)' },
      },
      fontFamily: {
        sans: ['var(--font-neue-montreal)', 'var(--font-plex)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: { DEFAULT: '6px' },
    },
  },
  plugins: [],
} satisfies Config
