import { AnimatePresence, motion } from 'motion/react'
import { formatNumber } from '../../ui'

export interface CompletionBurstProps {
  /** Zähler: Jede Erhöhung startet die Animation neu; 0 = nichts zeigen. */
  burst: number
  xp: number
  onDone: () => void
}

/** "+20 XP" steigt kurz über dem Haken auf, dazu ein sich ausbreitender Goldring. Rein dekorativ. */
export function CompletionBurst({ burst, xp, onDone }: CompletionBurstProps) {
  return (
    <AnimatePresence>
      {burst > 0 && (
        <motion.span key={`ring-${burst}`} aria-hidden="true" className="pointer-events-none absolute inset-0">
          <motion.span
            className="absolute inset-0 rounded-full ring-2 ring-gold-bright"
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: 0.65, ease: 'easeOut' }}
          />
          <motion.span
            className="absolute -top-3 left-1/2 -translate-x-1/2 font-display text-sm font-bold whitespace-nowrap text-gold-bright [text-shadow:0_0_10px_rgb(240_201_106/0.85),0_1px_2px_rgb(0_0_0/0.9)]"
            initial={{ opacity: 0, y: 4, scale: 0.8 }}
            animate={{ opacity: [0, 1, 1, 0], y: -24, scale: 1 }}
            transition={{ duration: 1.25, times: [0, 0.15, 0.7, 1], ease: 'easeOut' }}
            onAnimationComplete={onDone}
          >
            +{formatNumber(xp)} XP
          </motion.span>
        </motion.span>
      )}
    </AnimatePresence>
  )
}
