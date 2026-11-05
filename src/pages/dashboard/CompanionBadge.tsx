import { motion } from 'motion/react'
import { Link } from 'react-router'
import type { CompanionState } from '../../domain/types'
import { companionGlow, companionGlowStyle } from '../../features/feedback/companionTheme'
import { cn } from '../../ui'
import { COMPANION_PATH, companionBadgeLabel } from './companionText'

export interface CompanionBadgeProps {
  companion: CompanionState
  /** Einstellung „Effekte“: Hüpfer beim Treffer und der Schimmer der legendären Stufe. */
  effects: boolean
  /** Wechselt der Schlüssel, hüpft der Gefährte (sein Treffer gegen den Boss). */
  hopKey?: string
  className?: string
}

/**
 * Der Gefährte klein an der Boss-Karte (Phase 3b) – er kämpft ja mit: das Emoji im Ring seiner Stufe (Jungtier kaum
 * leuchtend … Legendär strahlend), daneben der Name; schlafend gedimmt mit 💤. Ein Link zur Gefährten-Karte auf der
 * Heldenseite (Tap-Ziel 40 px hoch). Trifft er den Boss, hüpft er kurz (nur mit Effekten).
 */
export function CompanionBadge({ companion, effects, hopKey, className }: CompanionBadgeProps) {
  const { choice, definition, stage, sleeping } = companion
  const label = companionBadgeLabel(companion)
  const shimmer = effects && !sleeping && companionGlow(stage).shimmer
  return (
    <Link
      to={COMPANION_PATH}
      aria-label={label}
      title={label}
      data-companion={choice.species}
      data-companion-stage={stage}
      data-companion-sleeping={sleeping ? '' : undefined}
      className={cn(
        'relative inline-flex h-7 max-w-[9.5rem] shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-black/25 pr-2.5 pl-0.5 text-xs font-semibold text-parchment',
        'transition-[border-color,background-color] duration-150 hover:border-gold/50 hover:bg-black/35 active:scale-95',
        // Sichtbar 28 px hoch, das Tap-Ziel per Pseudo-Element auf 40 px vergrößert.
        'before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-[""]',
        className,
      )}
    >
      <motion.span
        key={effects ? (hopKey ?? 'idle') : 'still'}
        aria-hidden="true"
        initial={false}
        animate={effects && hopKey ? { y: [0, -7, 0, -2, 0], rotate: [0, -8, 6, 0, 0] } : undefined}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        className={cn(
          'relative grid size-6 shrink-0 place-items-center rounded-full border bg-radial from-white/10 to-black/30 text-[0.9375rem] leading-none',
        )}
        style={companionGlowStyle(stage, sleeping)}
      >
        {shimmer && (
          <motion.span
            className="pointer-events-none absolute -inset-1 rounded-full"
            style={{ boxShadow: `0 0 10px 1px ${companionGlow(stage).color}` }}
            animate={{ opacity: [0.25, 0.8, 0.25] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        {/* Gedimmt wird nur der schlafende Gefährte selbst – nicht das 💤 daneben. */}
        <span className={cn('relative', sleeping && 'opacity-60 grayscale-[0.4]')}>{definition.icon}</span>
        {sleeping && (
          // Etwas größer und mit dunklem Schein: Auf dem dunklen Abzeichen bleibt das 💤 sonst kaum zu sehen.
          <span
            className="absolute -top-2 -right-2 text-xs leading-none drop-shadow-[0_0_2px_rgb(0_0_0/0.95)]"
            data-companion-zzz=""
          >
            💤
          </span>
        )}
      </motion.span>
      <span aria-hidden="true" className={cn('min-w-0 truncate', sleeping && 'text-muted')}>
        {choice.name}
      </span>
    </Link>
  )
}
