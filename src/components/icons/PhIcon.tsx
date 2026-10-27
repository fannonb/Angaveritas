import { phosphor } from './phosphor-data'

/**
 * A Phosphor icon. Both weights are drawn: the regular line shows by default, and the duotone
 * (line plus a soft fill) shows inside icon tiles. Which one is visible is decided in site.css.
 */
export function PhIcon({ name, className, size = '1.15em' }: { name: string; className?: string; size?: string }) {
  const icon = phosphor[name]
  if (!icon) return null
  return (
    <svg className={className ? `ph ${className}` : 'ph'} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" width={size} height={size}>
      <g className="ph-r" dangerouslySetInnerHTML={{ __html: icon.r }} />
      <g className="ph-d" dangerouslySetInnerHTML={{ __html: icon.d }} />
    </svg>
  )
}
