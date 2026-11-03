import { motion } from 'motion/react'
import { useId } from 'react'
import type { ReactNode } from 'react'
import { cn } from './cn'
import { clamp } from './format'

export type ProgressSize = 'xs' | 'sm' | 'md' | 'lg'

export interface ProgressBarProps {
  /** Fortschritt 0..1 – Werte außerhalb (und NaN) werden begrenzt. */
  value: number
  /** Füllfarbe (Hex), z. B. eine Attributfarbe. Standard: goldener Verlauf. */
  color?: string
  size?: ProgressSize
  /** Sichtbare Beschriftung über dem Balken (dient auch als zugänglicher Name). */
  label?: ReactNode
  /** Sichtbarer Wert rechts über dem Balken, z. B. "3 / 5" oder "54 %". */
  valueLabel?: ReactNode
  /** Zugänglicher Name, wenn kein sichtbares `label` existiert. Standard: "Fortschritt". */
  'aria-label'?: string
  /** Vorgelesener Wert, z. B. "3 von 5 Kapiteln". Standard: Prozent. */
  valueText?: string
  /** Breitenänderung animieren (Standard: an). */
  animated?: boolean
  /** Leuchtender Rand am Ende der Füllung. */
  glow?: boolean
  className?: string
}

const HEIGHTS: Record<ProgressSize, string> = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-3.5',
}

/** Fortschrittsbalken mit role="progressbar" (aria-valuenow in Prozent). */
export function ProgressBar({
  value,
  color,
  size = 'md',
  label,
  valueLabel,
  'aria-label': ariaLabel,
  valueText,
  animated = true,
  glow = false,
  className,
}: ProgressBarProps) {
  const labelId = useId()
  const fraction = clamp(value, 0, 1)
  const percent = Math.round(fraction * 100)
  const width = `${fraction * 100}%`

  return (
    <div className={cn('w-full', className)}>
      {(label !== undefined || valueLabel !== undefined) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
          {label !== undefined ? (
            <span id={labelId} className="min-w-0 truncate text-parchment">
              {label}
            </span>
          ) : (
            <span />
          )}
          {valueLabel !== undefined && <span className="shrink-0 text-muted tabular-nums">{valueLabel}</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={valueText ?? `${percent} %`}
        aria-labelledby={label !== undefined ? labelId : undefined}
        aria-label={label !== undefined ? undefined : (ariaLabel ?? 'Fortschritt')}
        className={cn(
          'relative w-full overflow-hidden rounded-full bg-black/45 shadow-[inset_0_1px_2px_rgb(0_0_0/0.6)] ring-1 ring-white/5 ring-inset',
          HEIGHTS[size],
        )}
      >
        <motion.div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full',
            color === undefined && 'bg-linear-to-r from-gold-dim via-gold to-gold-bright',
            glow && 'shadow-glow-sm',
          )}
          style={
            color === undefined
              ? undefined
              : {
                  backgroundColor: color,
                  backgroundImage: 'linear-gradient(180deg, rgb(255 255 255 / 0.28), rgb(255 255 255 / 0) 65%)',
                  boxShadow: glow ? `0 0 10px -1px ${color}` : undefined,
                }
          }
          initial={animated ? { width: 0 } : false}
          animate={{ width }}
          transition={animated ? { type: 'spring', stiffness: 120, damping: 22, mass: 0.8 } : { duration: 0 }}
        />
      </div>
    </div>
  )
}
