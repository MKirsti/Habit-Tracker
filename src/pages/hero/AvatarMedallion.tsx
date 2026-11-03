import { cn } from '../../ui'

export interface AvatarMedallionProps {
  avatar: string
  size?: 'md' | 'lg' | 'xl'
  className?: string
}

const SIZES = {
  md: 'size-16 text-[2.25rem]',
  lg: 'size-20 text-[2.75rem]',
  xl: 'size-24 text-[3.25rem] sm:size-28 sm:text-[3.75rem]',
} as const

/** Runde, golden umrandete Avatar-Plakette (dekorativ – der Name steht immer daneben). */
export function AvatarMedallion({ avatar, size = 'lg', className }: AvatarMedallionProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative grid shrink-0 place-items-center rounded-full leading-none',
        'bg-radial from-gold/28 via-gold/8 to-bg-deep/40 ring-2 ring-gold/50',
        'shadow-[0_0_0_6px_rgb(212_165_72/0.06),0_14px_34px_-14px_rgb(212_165_72/0.55)]',
        SIZES[size],
        className,
      )}
    >
      <span className="absolute -inset-2 rounded-full ring-1 ring-gold/15" />
      <span className="drop-shadow-[0_4px_10px_rgb(0_0_0/0.55)]">{avatar}</span>
    </div>
  )
}
