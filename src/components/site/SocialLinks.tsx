import { site } from '@/lib/site'
import { Icon } from './ui'

const networks = [
  { key: 'linkedin', label: 'LinkedIn', icon: 'linkedin' },
  { key: 'instagram', label: 'Instagram', icon: 'instagram' },
  { key: 'tiktok', label: 'TikTok', icon: 'tiktok' },
] as const

/** Links to AngaVeritas social profiles. `labelled` shows the network name next to the icon. */
export function SocialLinks({ variant = 'icon', className = '' }: { variant?: 'icon' | 'labelled'; className?: string }) {
  const links = networks.filter((n) => site.social[n.key])
  if (!links.length) return null
  return (
    <nav className={`social-links social-links--${variant} ${className}`.trim()} aria-label="AngaVeritas on social media">
      {links.map((n) => (
        <a key={n.key} href={site.social[n.key]} target="_blank" rel="noopener noreferrer" aria-label={`AngaVeritas on ${n.label}`} title={n.label}>
          <Icon name={n.icon} />
          {variant === 'labelled' && <span>{n.label}</span>}
        </a>
      ))}
    </nav>
  )
}
