import { motion } from 'motion/react'
import { cn } from './cn'
import { clamp, formatNumber } from './format'

export interface XpBarProps {
  level: number
  /** XP innerhalb des aktuellen Levels. */
  xpIntoLevel: number
  /** XP, die für das nächste Level innerhalb dieses Levels nötig sind. */
  xpForNextLevel: number
  /** Kompakte Variante (dünner Balken, kleine Zahlen) – z. B. für die Kopfzeile. */
  compact?: boolean
  /** Level-Beschriftung links anzeigen (Standard: an). */
  showLevel?: boolean
  /** Glanz-Animation (Standard: an; respektiert zusätzlich prefers-reduced-motion). */
  shimmer?: boolean
  className?: string
}

/**
 * Goldener Erfahrungsbalken mit Level und XP-Zahlen (de-DE formatiert).
 * Die Füllung ist zehnfach segmentiert, ein Lichtreflex läuft regelmäßig darüber.
 */
export function XpBar({
  level,
  xpIntoLevel,
  xpForNextLevel,
  compact = false,
  showLevel = true,
  shimmer = true,
  className,
}: XpBarProps) {
  const fraction = xpForNextLevel > 0 ? clamp(xpIntoLevel / xpForNextLevel, 0, 1) : 0
  const percent = Math.round(fraction * 100)
  const current = formatNumber(Math.max(0, Math.floor(xpIntoLevel)))
  const total = formatNumber(Math.max(0, Math.ceil(xpForNextLevel)))

  return (
    <div className={cn('w-full', className)}>
      <div className={cn('flex items-baseline justify-between gap-3', compact ? 'mb-1 text-xs' : 'mb-2 text-sm')}>
        {showLevel ? (
          <span className="font-display font-semibold tracking-wide text-gold-bright">
            Level <span className="tabular-nums">{formatNumber(level)}</span>
          </span>
        ) : (
          <span />
        )}
        <span className="text-muted tabular-nums">
          <span className="font-medium text-parchment">{current}</span> / {total} XP
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Erfahrung"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${current} von ${total} XP bis Level ${formatNumber(level + 1)}`}
        className={cn(
          'relative w-full overflow-hidden rounded-full border border-gold-deep/80 bg-black/55 shadow-[inset_0_1px_3px_rgb(0_0_0/0.7)]',
          compact ? 'h-2' : 'h-3.5',
        )}
      >
        <motion.div
          className="absolute inset-y-0 left-0 overflow-hidden rounded-full bg-linear-to-r from-[#8a6526] via-gold to-gold-bright shadow-[0_0_14px_-2px_rgb(240_201_106/0.7)]"
          initial={{ width: 0 }}
          animate={{ width: `${fraction * 100}%` }}
          transition={{ type: 'spring', stiffness: 90, damping: 20, mass: 0.9 }}
        >
          {/* Glanzkante oben */}
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1/2 rounded-full bg-white/25" />
          {shimmer && (
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-linear-to-r from-transparent via-white/55 to-transparent motion-safe:animate-shimmer motion-reduce:hidden"
            />
          )}
        </motion.div>
        {/* Segmentierung in Zehntel – wirkt wie ein klassischer RPG-Balken. */}
        {!compact && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0,transparent_calc(10%-1px),rgb(0_0_0/0.35)_calc(10%-1px),rgb(0_0_0/0.35)_10%)]"
          />
        )}
      </div>
    </div>
  )
}
