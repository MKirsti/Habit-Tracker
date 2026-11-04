import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { cn } from '../../ui'

/** Feste Flugbahnen (keine Zufälle): Winkel in Grad (0 = rechts, −90 = oben) und Weite in px. */
const COINS: readonly { angle: number; distance: number; size: number; delay: number }[] = [
  { angle: -90, distance: 88, size: 16, delay: 0 },
  { angle: -62, distance: 80, size: 14, delay: 0.03 },
  { angle: -118, distance: 82, size: 14, delay: 0.02 },
  { angle: -35, distance: 70, size: 12, delay: 0.06 },
  { angle: -145, distance: 68, size: 12, delay: 0.05 },
  { angle: -76, distance: 112, size: 11, delay: 0.09 },
  { angle: -104, distance: 110, size: 11, delay: 0.08 },
  { angle: -12, distance: 58, size: 10, delay: 0.1 },
  { angle: -168, distance: 56, size: 10, delay: 0.11 },
  { angle: -50, distance: 120, size: 9, delay: 0.13 },
  { angle: -130, distance: 118, size: 9, delay: 0.12 },
  { angle: -90, distance: 128, size: 8, delay: 0.16 },
]

/** Dauer eines Münzregens in ms (danach `onDone`). */
export const COIN_BURST_MS = 1100

export interface CoinBurstProps {
  /** Wird nach dem Ausklingen aufgerufen (zum Entfernen). */
  onDone: () => void
  className?: string
}

/**
 * Kleine Feier beim Einlösen: ein Schwall goldener Münzen, der aus der Mitte des Containers aufsteigt und
 * verglüht. Rein dekorativ (aria-hidden, fängt keine Klicks ab). Ob er überhaupt erscheint (Einstellung
 * „Effekte“, reduzierte Bewegung), entscheidet der Aufrufer.
 */
export function CoinBurst({ onDone, className }: CoinBurstProps) {
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  })
  useEffect(() => {
    const timer = window.setTimeout(() => onDoneRef.current(), COIN_BURST_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <span aria-hidden="true" data-coin-burst="" className={cn('pointer-events-none absolute inset-0 z-20', className)}>
      {/* Lichtschein */}
      <motion.span
        className="absolute top-1/2 left-1/2 size-28 -translate-x-1/2 -translate-y-1/2 rounded-full bg-radial from-gold-bright/45 to-transparent"
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: [0, 1, 0], scale: [0.4, 1.15, 1.4] }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
      {COINS.map((coin, index) => {
        const radians = (coin.angle * Math.PI) / 180
        const x = Math.cos(radians) * coin.distance
        const y = Math.sin(radians) * coin.distance
        return (
          <motion.span
            key={index}
            className="absolute top-1/2 left-1/2 rounded-full border border-gold-deep/70 bg-radial from-gold-bright via-gold to-gold-dim shadow-[0_0_8px_rgb(240_201_106/0.55)]"
            style={{ width: coin.size, height: coin.size, marginLeft: -coin.size / 2, marginTop: -coin.size / 2 }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4, rotateY: 0 }}
            animate={{
              x: [0, x, x * 1.08],
              // Erst hinauf, dann ein wenig zurückfallen (Schwerkraft).
              y: [0, y, y + 26],
              opacity: [0, 1, 0],
              scale: [0.4, 1, 0.85],
              rotateY: [0, 180, 360],
            }}
            transition={{ duration: 0.95, delay: coin.delay, times: [0, 0.45, 1], ease: ['easeOut', 'easeIn'] }}
          />
        )
      })}
    </span>
  )
}
