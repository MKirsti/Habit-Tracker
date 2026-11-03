import { Check } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { Ref } from 'react'
import { clamp, cn } from '../../ui'

export interface CheckButtonProps {
  checked: boolean
  /** Teilfortschritt 0..1 (messbare Quests) – als goldener Ring dargestellt. */
  progress: number
  /** Zugänglicher Name, z. B. "Täglich lesen erledigt". */
  label: string
  onToggle: () => void
  ref?: Ref<HTMLButtonElement>
}

/** Ringradius im 48er-Koordinatensystem des SVG. */
const RADIUS = 21.5

/**
 * Großer runder Abhak-Knopf (48 px) mit Fortschrittsring. Semantik: Kontrollkästchen.
 * Erledigt: goldene Scheibe mit Haken, der kurz „aufploppt“.
 */
export function CheckButton({ checked, progress, label, onToggle, ref }: CheckButtonProps) {
  const ring = checked ? 1 : clamp(progress, 0, 1)

  return (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        // touch-manipulation: schnelles Doppeltippen zoomt auf iOS nicht die Seite.
        'group/check relative grid size-12 shrink-0 touch-manipulation place-items-center rounded-full',
        'transition-transform duration-150 active:scale-90',
      )}
    >
      {/* Grundfläche + Fortschrittsring */}
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" className="absolute inset-0 size-full -rotate-90">
        <circle
          cx="24"
          cy="24"
          r={RADIUS}
          className={cn(
            'fill-bg-deep/70 stroke-border-strong transition-colors duration-150',
            !checked && 'group-hover/check:stroke-gold-dim',
          )}
          strokeWidth="2.5"
        />
        <motion.circle
          cx="24"
          cy="24"
          r={RADIUS}
          fill="none"
          className="stroke-gold"
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: ring, opacity: ring > 0 ? 1 : 0 }}
          transition={{ type: 'spring', stiffness: 160, damping: 24 }}
        />
      </svg>

      {/* Goldene Scheibe bei „erledigt“ */}
      <AnimatePresence initial={false}>
        {checked && (
          <motion.span
            key="disc"
            aria-hidden="true"
            className="absolute inset-[3px] rounded-full bg-linear-to-b from-gold-bright to-gold shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_0_16px_-2px_rgb(240_201_106/0.75)]"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: [0.4, 1.14, 1], opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.38, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      <motion.span
        key={checked ? 'on' : 'off'}
        aria-hidden="true"
        className={cn(
          'relative grid place-items-center',
          checked ? 'text-on-gold' : 'text-faint transition-colors group-hover/check:text-gold-dim',
        )}
        initial={checked ? { scale: 0, rotate: -40 } : false}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 520, damping: 18, delay: 0.05 }}
      >
        <Check className="size-6" strokeWidth={checked ? 3 : 2.25} />
      </motion.span>
    </button>
  )
}
