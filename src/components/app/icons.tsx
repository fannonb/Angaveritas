import { PhIcon } from '@/components/icons/PhIcon'

// Icons for the portal and staff workspace. Phosphor (see components/icons); names are kept stable so call sites don't change.
export function AppIcon({ name, className }: { name: string; className?: string }) {
  return <PhIcon name={name} className={className} />
}
