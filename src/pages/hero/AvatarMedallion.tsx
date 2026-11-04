import type { FrameDefinition } from '../../domain/types'
import { AvatarFrame } from '../../features/combat/AvatarFrame'
import type { AvatarFrameDims } from '../../features/combat/AvatarFrame'
import { cn } from '../../ui'

export interface AvatarMedallionProps {
  avatar: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /**
   * Gewählter Avatar-Rahmen (Phase 3a): derselbe Rahmen wie im Helden-Kopf der Tagesübersicht (`AvatarFrame`: Verlauf
   * aus `FrameDefinition.colors`, Glanz, bei seltenen und legendären der wandernde Lichtbogen). Ohne Rahmen die goldene
   * Plakette.
   */
  frame?: Pick<FrameDefinition, 'id' | 'colors' | 'rarity'>
  /** Lichtbogen bewegen (Standard: wie `AvatarFrame` – mit „Effekte“ und ohne reduzierte Bewegung); `false` in Listen. */
  animate?: boolean
  className?: string
}

const SIZES = {
  sm: 'size-12 text-[1.625rem]',
  md: 'size-16 text-[2.25rem]',
  lg: 'size-20 text-[2.75rem]',
  xl: 'size-24 text-[3.25rem] sm:size-28 sm:text-[3.75rem]',
} as const

/** Maße im Rahmen je Größe (Ringbreite wächst mit). */
const FRAME_DIMS: Record<keyof typeof SIZES, AvatarFrameDims> = {
  sm: { box: 'size-12', text: 'text-[1.625rem]', ring: 3, halo: '-inset-1' },
  md: { box: 'size-16', text: 'text-[2.25rem]', ring: 4, halo: '-inset-1.5' },
  lg: { box: 'size-20', text: 'text-[2.75rem]', ring: 5, halo: '-inset-1.5' },
  xl: { box: 'size-24 sm:size-28', text: 'text-[3.25rem] sm:text-[3.75rem]', ring: 6, halo: '-inset-2' },
}

/** Runde Avatar-Plakette – golden umrandet oder im gewählten Rahmen (dekorativ, der Name steht immer daneben). */
export function AvatarMedallion({ avatar, size = 'lg', frame, animate, className }: AvatarMedallionProps) {
  if (frame !== undefined) {
    return (
      <AvatarFrame frame={frame} dims={FRAME_DIMS[size]} animate={animate} className={className}>
        <span className="drop-shadow-[0_4px_10px_rgb(0_0_0/0.55)]">{avatar}</span>
      </AvatarFrame>
    )
  }
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
